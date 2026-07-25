package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
)

const embeddingExactSearchChunkThreshold int64 = 20_000

var (
	errEmbeddingDimensionsUnsupported = errors.New("unsupported embedding dimensions")
	errEmbeddingQueryDimensions       = errors.New("query embedding dimensions do not match profile")
	ErrEmbeddingActiveChanged         = errors.New("active embedding generation changed during search")
)

const eligibleEmbeddingChunkCountQuery = `
	SELECT COUNT(*)
	FROM chunk_embeddings_v2 AS chunk
	JOIN document_embedding_indexes AS index
	  ON index.generation_id = chunk.generation_id
	 AND index.document_id = chunk.document_id
	 AND index.user_id = chunk.user_id
	JOIN documents AS document
	  ON document.id = index.document_id
	 AND document.user_id = index.user_id
	JOIN embedding_jobs AS job
	  ON job.generation_id = index.generation_id
	 AND job.document_id = index.document_id
	 AND job.user_id = index.user_id
	WHERE chunk.generation_id = $1::uuid
	  AND chunk.user_id = $2
	  AND job.status = 'succeeded'
	  AND job.desired_content_hash = index.indexed_content_hash
	  AND index.indexed_content_hash = document.content_hash
	  AND document.state = $3
	  AND ($4 = '' OR chunk.document_id <> $4)
`

func vectorDimensionCast(dimensions int) (string, error) {
	switch dimensions {
	case 384, 768, 1024, 1536:
		return fmt.Sprintf("vector(%d)", dimensions), nil
	default:
		return "", fmt.Errorf("%w: %d", errEmbeddingDimensionsUnsupported, dimensions)
	}
}

func (r *EmbeddingV2Repo) SearchActiveChunks(
	ctx context.Context,
	userID, excludeID string,
	queryEmbedding []float32,
	recallLimit int,
) (
	*model.EmbeddingGeneration,
	*model.EmbeddingProfile,
	[]model.SemanticChunkResult,
	string,
	error,
) {
	generation, profile, err := r.GetActiveGeneration(ctx)
	if err != nil {
		return nil, nil, nil, "", err
	}
	if len(queryEmbedding) != profile.Dimensions {
		return nil, nil, nil, "", fmt.Errorf(
			"%w: got %d, want %d",
			errEmbeddingQueryDimensions,
			len(queryEmbedding),
			profile.Dimensions,
		)
	}
	if recallLimit <= 0 {
		return generation, profile, []model.SemanticChunkResult{}, "precise", nil
	}
	vectorCast, err := vectorDimensionCast(profile.Dimensions)
	if err != nil {
		return nil, nil, nil, "", err
	}
	searchTx, ownedTx, searchPath, err := r.beginEmbeddingSearch(
		ctx,
		generation.ID,
		userID,
		excludeID,
	)
	if err != nil {
		return nil, nil, nil, "", err
	}
	if ownedTx {
		defer func() { _ = searchTx.Rollback() }()
	}
	query := preciseEmbeddingSearchQuery(vectorCast, profile.Dimensions)
	if searchPath == "hnsw" {
		query = hnswEmbeddingSearchQuery(vectorCast, profile.Dimensions)
	}
	rows, err := searchTx.QueryContext(
		ctx,
		query,
		generation.ID,
		userID,
		pgvector.NewVector(queryEmbedding),
		DocumentStateNormal,
		excludeID,
		recallLimit,
	)
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("search active embedding chunks: %w", err)
	}
	results, err := scanSemanticChunkResults(rows, searchPath)
	if err != nil {
		return nil, nil, nil, "", err
	}
	if ownedTx {
		if err := searchTx.Commit(); err != nil {
			return nil, nil, nil, "", fmt.Errorf("commit embedding search: %w", err)
		}
	}
	currentGeneration, _, err := r.GetActiveGeneration(ctx)
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("recheck active embedding generation: %w", err)
	}
	if currentGeneration.ID != generation.ID {
		return nil, nil, nil, "", ErrEmbeddingActiveChanged
	}
	return generation, profile, results, searchPath, nil
}

func (r *EmbeddingV2Repo) beginEmbeddingSearch(
	ctx context.Context,
	generationID, userID, excludeID string,
) (*sql.Tx, bool, string, error) {
	var eligibleChunks int64
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		eligibleEmbeddingChunkCountQuery,
		generationID,
		userID,
		DocumentStateNormal,
		excludeID,
	).Scan(&eligibleChunks); err != nil {
		return nil, false, "", fmt.Errorf("count active embedding chunks: %w", err)
	}
	searchTx, ownedTx, err := beginOrJoin(ctx, r.db)
	if err != nil {
		return nil, false, "", fmt.Errorf("begin embedding search: %w", err)
	}
	searchPath := "hnsw"
	setting := "SET LOCAL hnsw.iterative_scan = strict_order"
	if eligibleChunks <= embeddingExactSearchChunkThreshold {
		searchPath = "precise"
		setting = "SET LOCAL enable_indexscan = off"
	}
	if _, err := searchTx.ExecContext(ctx, setting); err != nil {
		if ownedTx {
			_ = searchTx.Rollback()
		}
		return nil, false, "", fmt.Errorf(
			"configure %s embedding search: %w",
			searchPath,
			err,
		)
	}
	return searchTx, ownedTx, searchPath, nil
}

func scanSemanticChunkResults(
	rows *sql.Rows,
	searchPath string,
) ([]model.SemanticChunkResult, error) {
	defer func() { _ = rows.Close() }()
	results := make([]model.SemanticChunkResult, 0)
	for rows.Next() {
		var result model.SemanticChunkResult
		var chunkType string
		if err := rows.Scan(
			&result.DocumentID,
			&result.Score,
			&chunkType,
			&result.MatchedText,
		); err != nil {
			return nil, fmt.Errorf("scan semantic chunk result: %w", err)
		}
		result.ChunkType = model.ChunkType(chunkType)
		result.SearchPath = searchPath
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate semantic chunk results: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close semantic chunk results: %w", err)
	}
	return results, nil
}

func preciseEmbeddingSearchQuery(vectorCast string, dimensions int) string {
	return fmt.Sprintf(`
		WITH scored AS MATERIALIZED (
			SELECT
				chunk.document_id,
				chunk.position,
				chunk.chunk_type,
				chunk.content,
				chunk.embedding::%[1]s <=> $3::%[1]s AS distance,
				GREATEST(
					-1::double precision,
					LEAST(
						1::double precision,
						1 - (chunk.embedding::%[1]s <=> $3::%[1]s)
					)
				)::real AS score
			FROM chunk_embeddings_v2 AS chunk
			JOIN document_embedding_indexes AS index
			  ON index.generation_id = chunk.generation_id
			 AND index.document_id = chunk.document_id
			 AND index.user_id = chunk.user_id
			JOIN documents AS document
			  ON document.id = index.document_id
			 AND document.user_id = index.user_id
			JOIN embedding_jobs AS job
			  ON job.generation_id = index.generation_id
			 AND job.document_id = index.document_id
			 AND job.user_id = index.user_id
			WHERE chunk.generation_id = $1::uuid
			  AND chunk.user_id = $2
			  AND chunk.dimensions = %[2]d
			  AND index.dimensions = %[2]d
			  AND job.status = 'succeeded'
			  AND job.desired_content_hash = index.indexed_content_hash
			  AND index.indexed_content_hash = document.content_hash
			  AND document.state = $4
			  AND ($5 = '' OR chunk.document_id <> $5)
		),
		ranked AS (
			SELECT
				document_id,
				position,
				chunk_type,
				content,
				distance,
				score,
				ROW_NUMBER() OVER (
					PARTITION BY document_id
					ORDER BY distance, position
				) AS row_number
			FROM scored
		)
		SELECT document_id, score, chunk_type, content
		FROM ranked
		WHERE row_number <= 3
		ORDER BY distance, document_id, position
		LIMIT $6
	`, vectorCast, dimensions)
}

func hnswEmbeddingSearchQuery(vectorCast string, dimensions int) string {
	return fmt.Sprintf(`
		SELECT
			chunk.document_id,
			GREATEST(
				-1::double precision,
				LEAST(
					1::double precision,
					1 - (chunk.embedding::%[1]s <=> $3::%[1]s)
				)
			)::real AS score,
			chunk.chunk_type,
			chunk.content
		FROM chunk_embeddings_v2 AS chunk
		WHERE chunk.generation_id = $1::uuid
		  AND chunk.user_id = $2
		  AND chunk.dimensions = %[2]d
		  AND ($5 = '' OR chunk.document_id <> $5)
		  AND EXISTS (
			SELECT 1
			FROM document_embedding_indexes AS index
			JOIN documents AS document
			  ON document.id = index.document_id
			 AND document.user_id = index.user_id
			JOIN embedding_jobs AS job
			  ON job.generation_id = index.generation_id
			 AND job.document_id = index.document_id
			 AND job.user_id = index.user_id
			WHERE index.generation_id = chunk.generation_id
			  AND index.document_id = chunk.document_id
			  AND index.user_id = chunk.user_id
			  AND index.dimensions = %[2]d
			  AND job.status = 'succeeded'
			  AND job.desired_content_hash = index.indexed_content_hash
			  AND index.indexed_content_hash = document.content_hash
			  AND document.state = $4
		  )
		  AND (
			SELECT COUNT(*)
			FROM (
				SELECT 1
				FROM chunk_embeddings_v2 AS better
				WHERE better.generation_id = chunk.generation_id
				  AND better.document_id = chunk.document_id
				  AND better.dimensions = %[2]d
				  AND (
					(better.embedding::%[1]s <=> $3::%[1]s)
						< (chunk.embedding::%[1]s <=> $3::%[1]s)
					OR (
						(better.embedding::%[1]s <=> $3::%[1]s)
							= (chunk.embedding::%[1]s <=> $3::%[1]s)
						AND better.position < chunk.position
					)
				  )
				ORDER BY better.embedding::%[1]s <=> $3::%[1]s, better.position
				LIMIT 3
			) AS closer
		  ) < 3
		ORDER BY chunk.embedding::%[1]s <=> $3::%[1]s
		LIMIT $6
	`, vectorCast, dimensions)
}

const sourceEmbeddingCentroidQuery = `
	SELECT index.centroid
	FROM document_embedding_indexes AS index
	JOIN documents AS document
	  ON document.id = index.document_id
	 AND document.user_id = index.user_id
	JOIN embedding_jobs AS job
	  ON job.generation_id = index.generation_id
	 AND job.document_id = index.document_id
	 AND job.user_id = index.user_id
	WHERE index.generation_id = $1::uuid
	  AND index.document_id = $2
	  AND index.user_id = $3
	  AND index.dimensions = $4
	  AND index.centroid IS NOT NULL
	  AND job.status = 'succeeded'
	  AND job.desired_content_hash = index.indexed_content_hash
	  AND index.indexed_content_hash = document.content_hash
	  AND document.state = $5
`

func (r *EmbeddingV2Repo) SimilarDocuments(
	ctx context.Context,
	userID, documentID string,
	limit int,
) (*model.EmbeddingGeneration, []model.SimilarDocumentResult, bool, error) {
	generation, profile, err := r.GetActiveGeneration(ctx)
	if err != nil {
		return nil, nil, false, err
	}
	vectorCast, err := vectorDimensionCast(profile.Dimensions)
	if err != nil {
		return nil, nil, false, err
	}
	centroid, current, err := r.sourceEmbeddingCentroid(
		ctx,
		generation.ID,
		userID,
		documentID,
		profile.Dimensions,
	)
	if err != nil {
		return nil, nil, false, err
	}
	if !current || limit <= 0 {
		return generation, []model.SimilarDocumentResult{}, current, nil
	}
	results, err := r.searchSimilarCentroids(
		ctx,
		generation.ID,
		userID,
		documentID,
		centroid,
		limit,
		similarCentroidSearchQuery(vectorCast, profile.Dimensions),
	)
	if err != nil {
		return nil, nil, false, err
	}
	if err := r.ensureActiveGeneration(ctx, generation.ID); err != nil {
		return nil, nil, false, err
	}
	return generation, results, true, nil
}

func (r *EmbeddingV2Repo) sourceEmbeddingCentroid(
	ctx context.Context,
	generationID, userID, documentID string,
	dimensions int,
) (pgvector.Vector, bool, error) {
	var centroid pgvector.Vector
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		sourceEmbeddingCentroidQuery,
		generationID,
		documentID,
		userID,
		dimensions,
		DocumentStateNormal,
	).Scan(&centroid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return pgvector.Vector{}, false, nil
		}
		return pgvector.Vector{}, false, fmt.Errorf(
			"get source embedding centroid: %w",
			err,
		)
	}
	return centroid, true, nil
}

func (r *EmbeddingV2Repo) searchSimilarCentroids(
	ctx context.Context,
	generationID, userID, documentID string,
	centroid pgvector.Vector,
	limit int,
	query string,
) ([]model.SimilarDocumentResult, error) {
	rows, err := conn(ctx, r.db).QueryContext(
		ctx,
		query,
		generationID,
		userID,
		documentID,
		centroid,
		DocumentStateNormal,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("search similar documents: %w", err)
	}
	defer func() { _ = rows.Close() }()
	results := make([]model.SimilarDocumentResult, 0, limit)
	for rows.Next() {
		var result model.SimilarDocumentResult
		if err := rows.Scan(&result.DocumentID, &result.Score); err != nil {
			return nil, fmt.Errorf("scan similar document: %w", err)
		}
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate similar documents: %w", err)
	}
	return results, nil
}

func (r *EmbeddingV2Repo) ensureActiveGeneration(
	ctx context.Context,
	expectedID string,
) error {
	currentGeneration, _, err := r.GetActiveGeneration(ctx)
	if err != nil {
		return fmt.Errorf("recheck active embedding generation: %w", err)
	}
	if currentGeneration.ID != expectedID {
		return ErrEmbeddingActiveChanged
	}
	return nil
}

func similarCentroidSearchQuery(vectorCast string, dimensions int) string {
	return fmt.Sprintf(`
		SELECT
			index.document_id,
			GREATEST(
				-1::double precision,
				LEAST(
					1::double precision,
					1 - (index.centroid::%[1]s <=> $4::%[1]s)
				)
			)::real AS score
		FROM document_embedding_indexes AS index
		JOIN documents AS document
		  ON document.id = index.document_id
		 AND document.user_id = index.user_id
		JOIN embedding_jobs AS job
		  ON job.generation_id = index.generation_id
		 AND job.document_id = index.document_id
		 AND job.user_id = index.user_id
		WHERE index.generation_id = $1::uuid
		  AND index.user_id = $2
		  AND index.document_id <> $3
		  AND index.dimensions = %[2]d
		  AND index.centroid IS NOT NULL
		  AND job.status = 'succeeded'
		  AND job.desired_content_hash = index.indexed_content_hash
		  AND index.indexed_content_hash = document.content_hash
		  AND document.state = $5
		ORDER BY index.centroid::%[1]s <=> $4::%[1]s
		LIMIT $6
	`, vectorCast, dimensions)
}
