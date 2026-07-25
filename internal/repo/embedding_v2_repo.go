package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
)

const embeddingGenerationControlLock int64 = 6_202_607_252

func generationAcceptsEmbeddingWrites(
	status model.EmbeddingGenerationStatus,
	standbyUntil, now int64,
) bool {
	switch status {
	case model.EmbeddingGenerationActive, model.EmbeddingGenerationBuilding:
		return true
	case model.EmbeddingGenerationStandby:
		return standbyUntil > now
	case model.EmbeddingGenerationRetired, model.EmbeddingGenerationFailed:
		return false
	}
	return false
}

var (
	errEmbeddingProfileChanged       = errors.New("embedding profile fingerprint changed")
	errEmbeddingGenerationNotReady   = errors.New("embedding generation is not ready")
	errEmbeddingGenerationTransition = errors.New("invalid embedding generation transition")
	errEmbeddingVectorSampleLimit    = errors.New("embedding vector sample limit must be positive")
	errEmbeddingGenerationVectors    = errors.New("embedding generation contains inconsistent vector rows")
	errEmbeddingVectorDimensions     = errors.New("embedding vector dimensions do not match profile")
	errEmbeddingVectorNonFinite      = errors.New("embedding vector contains non-finite values")
	errEmbeddingClaimChanged         = errors.New("embedding claim changed while locked")
)

const embeddingGenerationVectorInvariantQuery = `
	SELECT
		EXISTS (
			SELECT 1
			FROM document_embedding_indexes AS index
			WHERE index.generation_id = $1::uuid
			  AND (
				index.dimensions <> $2
				OR index.chunk_count <> (
					SELECT COUNT(*)
					FROM chunk_embeddings_v2 AS chunk
					WHERE chunk.generation_id = index.generation_id
					  AND chunk.document_id = index.document_id
					  AND chunk.user_id = index.user_id
				)
			  )
		)
		OR EXISTS (
			SELECT 1
			FROM chunk_embeddings_v2 AS chunk
			WHERE chunk.generation_id = $1::uuid
			  AND (
				chunk.dimensions <> $2
				OR NOT EXISTS (
					SELECT 1
					FROM document_embedding_indexes AS index
					WHERE index.generation_id = chunk.generation_id
					  AND index.document_id = chunk.document_id
					  AND index.user_id = chunk.user_id
				)
			  )
		)
`

const embeddingChunkVectorSampleQuery = `
	SELECT embedding
	FROM chunk_embeddings_v2
	WHERE generation_id = $1::uuid AND dimensions = $2
	ORDER BY document_id, position
	LIMIT $3
`

const embeddingCentroidVectorSampleQuery = `
	SELECT centroid
	FROM document_embedding_indexes
	WHERE generation_id = $1::uuid
	  AND dimensions = $2
	  AND centroid IS NOT NULL
	ORDER BY document_id
	LIMIT $3
`

const currentBuildingEmbeddingGenerationQuery = `
	SELECT id::text, profile_id, status, reason, standby_until,
		ctime, mtime, activated_at
	FROM embedding_generations
	WHERE status = 'building'
	FOR UPDATE
`

const failBuildingEmbeddingGenerationQuery = `
	UPDATE embedding_generations
	SET status = 'failed', mtime = $2
	WHERE id = $1::uuid AND status = 'building'
`

const fenceRestartedEmbeddingJobsQuery = `
	UPDATE embedding_jobs
	SET status = 'dead',
		claim_token = NULL,
		lease_until = 0,
		last_error_code = 'generation_restarted',
		last_error_message = 'embedding generation was restarted',
		mtime = $2
	WHERE generation_id = $1::uuid AND status = 'running'
`

const insertBuildingEmbeddingGenerationQuery = `
	INSERT INTO embedding_generations (
		profile_id, status, reason, standby_until, ctime, mtime, activated_at
	)
	VALUES ($1, 'building', $2, 0, $3, $3, 0)
	RETURNING id::text, profile_id, status, reason, standby_until,
		ctime, mtime, activated_at
`

const enqueueEmbeddingContentChangeQuery = `
	INSERT INTO embedding_jobs (
		generation_id, document_id, user_id,
		desired_content_hash, desired_revision,
		status, available_at, attempts, claim_token, lease_until,
		last_error_code, last_error_message, ctime, mtime
	)
	SELECT
		g.id, $1, $2, $3, $4,
		'pending', $5, 0, NULL, 0, '', '', $6, $6
	FROM embedding_generations AS g
	WHERE g.status IN ('active', 'building')
	   OR (g.status = 'standby' AND g.standby_until > $6)
	ON CONFLICT (generation_id, document_id) DO UPDATE SET
		user_id = EXCLUDED.user_id,
		desired_content_hash = EXCLUDED.desired_content_hash,
		desired_revision = EXCLUDED.desired_revision,
		status = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.status
			ELSE 'pending'
		END,
		available_at = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.available_at
			ELSE EXCLUDED.available_at
		END,
		attempts = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.attempts
			ELSE 0
		END,
		claim_token = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.claim_token
			ELSE NULL
		END,
		lease_until = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.lease_until
			ELSE 0
		END,
		last_error_code = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.last_error_code
			ELSE ''
		END,
		last_error_message = CASE
			WHEN embedding_jobs.desired_content_hash = EXCLUDED.desired_content_hash
				THEN embedding_jobs.last_error_message
			ELSE ''
		END,
		mtime = EXCLUDED.mtime
`

const updateEmbeddingIndexRevisionQuery = `
	UPDATE document_embedding_indexes AS index
	SET indexed_revision = $4
	FROM embedding_generations AS generation
	WHERE index.generation_id = generation.id
		AND index.document_id = $1
		AND index.user_id = $2
		AND index.indexed_content_hash = $3
		AND (
			generation.status IN ('active', 'building')
			OR (generation.status = 'standby' AND generation.standby_until > $5)
		)
`

type EmbeddingV2Repo struct {
	db *sql.DB
}

func NewEmbeddingV2Repo(db *sql.DB) *EmbeddingV2Repo {
	return &EmbeddingV2Repo{db: db}
}

func (r *EmbeddingV2Repo) EnsureProfile(
	ctx context.Context, profile model.EmbeddingProfile,
) error {
	const insertQuery = `
		INSERT INTO embedding_profiles (
			id, fingerprint, space_id, model, dimensions, metric,
			query_task_type, document_task_type, chunker_version, ctime
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO NOTHING
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		insertQuery,
		profile.ID,
		profile.Fingerprint,
		profile.SpaceID,
		profile.Model,
		profile.Dimensions,
		profile.Metric,
		profile.QueryTaskType,
		profile.DocumentTaskType,
		profile.ChunkerVersion,
		profile.Ctime,
	); err != nil {
		return fmt.Errorf("insert embedding profile: %w", err)
	}
	stored, err := r.GetProfile(ctx, profile.ID)
	if err != nil {
		return err
	}
	if stored.Fingerprint != profile.Fingerprint {
		return fmt.Errorf(
			"%w: id=%s stored=%s configured=%s",
			errEmbeddingProfileChanged,
			profile.ID,
			stored.Fingerprint,
			profile.Fingerprint,
		)
	}
	return nil
}

func (r *EmbeddingV2Repo) GetProfile(
	ctx context.Context, profileID string,
) (*model.EmbeddingProfile, error) {
	const query = `
		SELECT id, fingerprint, space_id, model, dimensions, metric,
			query_task_type, document_task_type, chunker_version, ctime
		FROM embedding_profiles
		WHERE id = $1
	`
	var profile model.EmbeddingProfile
	if err := conn(ctx, r.db).QueryRowContext(ctx, query, profileID).Scan(
		&profile.ID,
		&profile.Fingerprint,
		&profile.SpaceID,
		&profile.Model,
		&profile.Dimensions,
		&profile.Metric,
		&profile.QueryTaskType,
		&profile.DocumentTaskType,
		&profile.ChunkerVersion,
		&profile.Ctime,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("embedding profile %q: %w", profileID, sql.ErrNoRows)
		}
		return nil, fmt.Errorf("scan embedding profile: %w", err)
	}
	return &profile, nil
}

func scanEmbeddingGeneration(scanner rowScanner) (*model.EmbeddingGeneration, error) {
	var generation model.EmbeddingGeneration
	var status string
	if err := scanner.Scan(
		&generation.ID,
		&generation.ProfileID,
		&status,
		&generation.Reason,
		&generation.StandbyUntil,
		&generation.Ctime,
		&generation.Mtime,
		&generation.ActivatedAt,
	); err != nil {
		return nil, fmt.Errorf("scan embedding generation row: %w", err)
	}
	generation.Status = model.EmbeddingGenerationStatus(status)
	return &generation, nil
}

func (r *EmbeddingV2Repo) GetGeneration(
	ctx context.Context, generationID string,
) (*model.EmbeddingGeneration, error) {
	const query = `
		SELECT id::text, profile_id, status, reason, standby_until,
			ctime, mtime, activated_at
		FROM embedding_generations
		WHERE id = $1::uuid
	`
	generation, err := scanEmbeddingGeneration(
		conn(ctx, r.db).QueryRowContext(ctx, query, generationID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("embedding generation %q: %w", generationID, sql.ErrNoRows)
		}
		return nil, fmt.Errorf("scan embedding generation: %w", err)
	}
	return generation, nil
}

func (r *EmbeddingV2Repo) GetActiveGeneration(
	ctx context.Context,
) (*model.EmbeddingGeneration, *model.EmbeddingProfile, error) {
	const query = `
		SELECT
			g.id::text, g.profile_id, g.status, g.reason, g.standby_until,
			g.ctime, g.mtime, g.activated_at,
			p.id, p.fingerprint, p.space_id, p.model, p.dimensions, p.metric,
			p.query_task_type, p.document_task_type, p.chunker_version, p.ctime
		FROM embedding_generations AS g
		JOIN embedding_profiles AS p ON p.id = g.profile_id
		WHERE g.status = 'active'
	`
	row := conn(ctx, r.db).QueryRowContext(ctx, query)
	var generation model.EmbeddingGeneration
	var profile model.EmbeddingProfile
	var status string
	if err := row.Scan(
		&generation.ID,
		&generation.ProfileID,
		&status,
		&generation.Reason,
		&generation.StandbyUntil,
		&generation.Ctime,
		&generation.Mtime,
		&generation.ActivatedAt,
		&profile.ID,
		&profile.Fingerprint,
		&profile.SpaceID,
		&profile.Model,
		&profile.Dimensions,
		&profile.Metric,
		&profile.QueryTaskType,
		&profile.DocumentTaskType,
		&profile.ChunkerVersion,
		&profile.Ctime,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, sql.ErrNoRows
		}
		return nil, nil, fmt.Errorf("scan active embedding generation: %w", err)
	}
	generation.Status = model.EmbeddingGenerationStatus(status)
	return &generation, &profile, nil
}

func (r *EmbeddingV2Repo) ListGenerations(
	ctx context.Context,
) ([]model.EmbeddingGeneration, error) {
	const query = `
		SELECT id::text, profile_id, status, reason, standby_until,
			ctime, mtime, activated_at
		FROM embedding_generations
		ORDER BY ctime DESC, id
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list embedding generations: %w", err)
	}
	defer func() { _ = rows.Close() }()
	result := make([]model.EmbeddingGeneration, 0)
	for rows.Next() {
		generation, err := scanEmbeddingGeneration(rows)
		if err != nil {
			return nil, fmt.Errorf("scan embedding generation: %w", err)
		}
		result = append(result, *generation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate embedding generations: %w", err)
	}
	return result, nil
}

func (r *EmbeddingV2Repo) ListCooldowns(
	ctx context.Context,
	profileID string,
) ([]model.EmbeddingProviderCooldown, error) {
	const query = `
		SELECT profile_id, provider_name, blocked_until, last_error_code, mtime
		FROM embedding_provider_cooldowns
		WHERE ($1 = '' OR profile_id = $1)
		ORDER BY profile_id, provider_name
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, query, profileID)
	if err != nil {
		return nil, fmt.Errorf("list embedding provider cooldowns: %w", err)
	}
	defer func() { _ = rows.Close() }()
	result := make([]model.EmbeddingProviderCooldown, 0)
	for rows.Next() {
		var cooldown model.EmbeddingProviderCooldown
		if err := rows.Scan(
			&cooldown.ProfileID,
			&cooldown.ProviderName,
			&cooldown.BlockedUntil,
			&cooldown.LastErrorCode,
			&cooldown.Mtime,
		); err != nil {
			return nil, fmt.Errorf("scan embedding provider cooldown: %w", err)
		}
		result = append(result, cooldown)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate embedding provider cooldowns: %w", err)
	}
	return result, nil
}

func (r *EmbeddingV2Repo) ValidateGenerationVectors(
	ctx context.Context,
	generationID string,
	sampleLimit int,
) error {
	if sampleLimit <= 0 {
		return errEmbeddingVectorSampleLimit
	}
	generation, err := r.GetGeneration(ctx, generationID)
	if err != nil {
		return err
	}
	profile, err := r.GetProfile(ctx, generation.ProfileID)
	if err != nil {
		return err
	}
	var invalid bool
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		embeddingGenerationVectorInvariantQuery,
		generationID,
		profile.Dimensions,
	).Scan(&invalid); err != nil {
		return fmt.Errorf("validate embedding generation invariants: %w", err)
	}
	if invalid {
		return errEmbeddingGenerationVectors
	}
	if err := r.validateVectorRows(
		ctx,
		embeddingChunkVectorSampleQuery,
		profile.Dimensions,
		generationID,
		profile.Dimensions,
		sampleLimit,
	); err != nil {
		return fmt.Errorf("validate embedding chunk sample: %w", err)
	}
	if err := r.validateVectorRows(
		ctx,
		embeddingCentroidVectorSampleQuery,
		profile.Dimensions,
		generationID,
		profile.Dimensions,
		sampleLimit,
	); err != nil {
		return fmt.Errorf("validate embedding centroid sample: %w", err)
	}
	return nil
}

func (r *EmbeddingV2Repo) validateVectorRows(
	ctx context.Context,
	query string,
	dimensions int,
	args ...any,
) error {
	rows, err := conn(ctx, r.db).QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("query embedding vector sample: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var vector pgvector.Vector
		if err := rows.Scan(&vector); err != nil {
			return fmt.Errorf("scan embedding vector sample: %w", err)
		}
		values := vector.Slice()
		if len(values) != dimensions {
			return fmt.Errorf(
				"%w: got %d, want %d",
				errEmbeddingVectorDimensions,
				len(values),
				dimensions,
			)
		}
		for _, value := range values {
			if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
				return errEmbeddingVectorNonFinite
			}
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate embedding vector samples: %w", err)
	}
	return nil
}

func (r *EmbeddingV2Repo) CreateBuildingGeneration(
	ctx context.Context,
	profileID, reason string,
	restart bool,
	now int64,
) (*model.EmbeddingGeneration, error) {
	var created *model.EmbeddingGeneration
	err := RunInTx(ctx, r.db, func(txCtx context.Context) error {
		generation, err := r.createBuildingGenerationTx(
			txCtx,
			profileID,
			reason,
			restart,
			now,
		)
		if err != nil {
			return err
		}
		created = generation
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err := r.seedGenerationJobs(ctx, created.ID, now); err != nil {
		return nil, err
	}
	return created, nil
}

func (r *EmbeddingV2Repo) createBuildingGenerationTx(
	ctx context.Context,
	profileID, reason string,
	restart bool,
	now int64,
) (*model.EmbeddingGeneration, error) {
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		"SELECT pg_advisory_xact_lock($1)",
		embeddingGenerationControlLock,
	); err != nil {
		return nil, fmt.Errorf("lock embedding generation control: %w", err)
	}
	current, err := scanEmbeddingGeneration(
		conn(ctx, r.db).QueryRowContext(
			ctx,
			currentBuildingEmbeddingGenerationQuery,
		),
	)
	switch {
	case err == nil && !restart:
		if current.ProfileID != profileID {
			return nil, fmt.Errorf(
				"%w: building generation %s already uses profile %s",
				errEmbeddingGenerationTransition,
				current.ID,
				current.ProfileID,
			)
		}
		return current, nil
	case err == nil:
		if err := r.fenceRestartedGeneration(ctx, current.ID, now); err != nil {
			return nil, err
		}
	case !errors.Is(err, sql.ErrNoRows):
		return nil, fmt.Errorf("scan building generation: %w", err)
	}
	generation, err := scanEmbeddingGeneration(
		conn(ctx, r.db).QueryRowContext(
			ctx,
			insertBuildingEmbeddingGenerationQuery,
			profileID,
			reason,
			now,
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create building generation: %w", err)
	}
	return generation, nil
}

func (r *EmbeddingV2Repo) fenceRestartedGeneration(
	ctx context.Context,
	generationID string,
	now int64,
) error {
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		failBuildingEmbeddingGenerationQuery,
		generationID,
		now,
	); err != nil {
		return fmt.Errorf("fail previous building generation: %w", err)
	}
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		fenceRestartedEmbeddingJobsQuery,
		generationID,
		now,
	); err != nil {
		return fmt.Errorf("fence restarted embedding jobs: %w", err)
	}
	return nil
}

func (r *EmbeddingV2Repo) seedGenerationJobs(
	ctx context.Context,
	generationID string,
	now int64,
) error {
	const batchSize = 1000
	cursor := ""
	for {
		const query = `
			WITH candidates AS MATERIALIZED (
				SELECT id, user_id, content_hash, content_revision
				FROM documents
				WHERE state = $3 AND id > $4
				ORDER BY id
				LIMIT $5
			),
			inserted AS (
				INSERT INTO embedding_jobs (
					generation_id, document_id, user_id,
					desired_content_hash, desired_revision,
					status, available_at, attempts, claim_token, lease_until,
					last_error_code, last_error_message, ctime, mtime
				)
				SELECT
					$1::uuid, id, user_id, content_hash, content_revision,
					'pending', $2, 0, NULL, 0, '', '', $2, $2
				FROM candidates
				ON CONFLICT (generation_id, document_id) DO NOTHING
				RETURNING document_id
			)
			SELECT COALESCE(MAX(id), ''), COUNT(*)
			FROM candidates
		`
		var nextCursor string
		var candidates int
		if err := conn(ctx, r.db).QueryRowContext(
			ctx,
			query,
			generationID,
			now,
			DocumentStateNormal,
			cursor,
			batchSize,
		).Scan(&nextCursor, &candidates); err != nil {
			return fmt.Errorf("seed building generation jobs: %w", err)
		}
		if candidates == 0 {
			return nil
		}
		cursor = nextCursor
	}
}

func (r *EmbeddingV2Repo) EnqueueContentChange(
	ctx context.Context,
	userID, documentID, contentHash string,
	revision, now, delaySeconds int64,
) error {
	availableAt := now + delaySeconds
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		enqueueEmbeddingContentChangeQuery,
		documentID,
		userID,
		contentHash,
		revision,
		availableAt,
		now,
	); err != nil {
		return fmt.Errorf("enqueue embedding content change: %w", err)
	}
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		updateEmbeddingIndexRevisionQuery,
		documentID,
		userID,
		contentHash,
		revision,
		now,
	); err != nil {
		return fmt.Errorf("update embedding index revision: %w", err)
	}
	return nil
}

func (r *EmbeddingV2Repo) DeleteDocumentData(
	ctx context.Context, userID, documentID string,
) error {
	queries := []string{
		`DELETE FROM chunk_embeddings_v2 WHERE user_id = $1 AND document_id = $2`,
		`DELETE FROM document_embedding_indexes WHERE user_id = $1 AND document_id = $2`,
		`DELETE FROM embedding_jobs WHERE user_id = $1 AND document_id = $2`,
	}
	for _, query := range queries {
		if _, err := conn(ctx, r.db).ExecContext(ctx, query, userID, documentID); err != nil {
			return fmt.Errorf("delete embedding v2 document data: %w", err)
		}
	}
	return nil
}

const claimEmbeddingJobsQuery = `
	WITH candidates AS (
		SELECT
			job.generation_id,
			job.document_id,
			document.title,
			document.content,
			document.content_hash,
			document.content_revision,
			generation.status AS generation_status,
			profile.id AS profile_id,
			profile.fingerprint,
			profile.space_id,
			profile.model,
			profile.dimensions,
			profile.metric,
			profile.query_task_type,
			profile.document_task_type,
			profile.chunker_version,
			profile.ctime AS profile_ctime
		FROM embedding_jobs AS job
		JOIN embedding_generations AS generation
			ON generation.id = job.generation_id
		JOIN embedding_profiles AS profile
			ON profile.id = generation.profile_id
		JOIN documents AS document
			ON document.id = job.document_id
			AND document.user_id = job.user_id
		WHERE generation.status = $1
			AND (
				generation.status <> 'standby'
				OR generation.standby_until > $3
			)
			AND document.state = $2
			AND document.content_hash = job.desired_content_hash
			AND (
				(
					job.status IN ('pending', 'failed')
					AND job.available_at <= $3
				)
				OR (
					job.status = 'running'
					AND job.lease_until < $3
				)
			)
		ORDER BY job.available_at, job.mtime, job.document_id
		FOR UPDATE OF job SKIP LOCKED
		LIMIT $4
	)
	UPDATE embedding_jobs AS job
	SET status = 'running',
		attempts = job.attempts + 1,
		claim_token = gen_random_uuid(),
		lease_until = $5,
		mtime = $3
	FROM candidates AS candidate
	WHERE job.generation_id = candidate.generation_id
		AND job.document_id = candidate.document_id
	RETURNING
		job.generation_id::text,
		job.document_id,
		job.user_id,
		job.desired_content_hash,
		job.desired_revision,
		job.status,
		job.available_at,
		job.attempts,
		job.claim_token::text,
		job.lease_until,
		job.last_error_code,
		job.last_error_message,
		job.ctime,
		job.mtime,
		candidate.generation_status,
		candidate.profile_id,
		candidate.fingerprint,
		candidate.space_id,
		candidate.model,
		candidate.dimensions,
		candidate.metric,
		candidate.query_task_type,
		candidate.document_task_type,
		candidate.chunker_version,
		candidate.profile_ctime,
		candidate.title,
		candidate.content
`

func (r *EmbeddingV2Repo) ClaimJobs(
	ctx context.Context,
	generationStatus model.EmbeddingGenerationStatus,
	limit int,
	now, leaseUntil int64,
) ([]model.EmbeddingJobClaim, error) {
	if limit <= 0 {
		return []model.EmbeddingJobClaim{}, nil
	}
	rows, err := conn(ctx, r.db).QueryContext(
		ctx,
		claimEmbeddingJobsQuery,
		string(generationStatus),
		DocumentStateNormal,
		now,
		limit,
		leaseUntil,
	)
	if err != nil {
		return nil, fmt.Errorf("claim embedding jobs: %w", err)
	}
	defer func() { _ = rows.Close() }()
	claims := make([]model.EmbeddingJobClaim, 0, limit)
	for rows.Next() {
		claim, err := scanEmbeddingJobClaim(rows)
		if err != nil {
			return nil, err
		}
		claims = append(claims, *claim)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate embedding job claims: %w", err)
	}
	return claims, nil
}

func scanEmbeddingJobClaim(scanner rowScanner) (*model.EmbeddingJobClaim, error) {
	var claim model.EmbeddingJobClaim
	var jobStatus, generationState string
	if err := scanner.Scan(
		&claim.GenerationID,
		&claim.DocumentID,
		&claim.UserID,
		&claim.DesiredContentHash,
		&claim.DesiredRevision,
		&jobStatus,
		&claim.AvailableAt,
		&claim.Attempts,
		&claim.ClaimToken,
		&claim.LeaseUntil,
		&claim.LastErrorCode,
		&claim.LastErrorMessage,
		&claim.Ctime,
		&claim.Mtime,
		&generationState,
		&claim.Profile.ID,
		&claim.Profile.Fingerprint,
		&claim.Profile.SpaceID,
		&claim.Profile.Model,
		&claim.Profile.Dimensions,
		&claim.Profile.Metric,
		&claim.Profile.QueryTaskType,
		&claim.Profile.DocumentTaskType,
		&claim.Profile.ChunkerVersion,
		&claim.Profile.Ctime,
		&claim.Title,
		&claim.Content,
	); err != nil {
		return nil, fmt.Errorf("scan embedding job claim: %w", err)
	}
	claim.Status = model.EmbeddingJobStatus(jobStatus)
	claim.GenerationStatus = model.EmbeddingGenerationStatus(generationState)
	return &claim, nil
}

func (r *EmbeddingV2Repo) RenewClaim(
	ctx context.Context,
	generationID, documentID, claimToken string,
	leaseUntil, now int64,
) (bool, error) {
	const query = `
		UPDATE embedding_jobs
		SET lease_until = $4, mtime = $5
		WHERE generation_id = $1::uuid
			AND document_id = $2
			AND claim_token = $3::uuid
			AND status = 'running'
			AND EXISTS (
				SELECT 1
				FROM embedding_generations AS generation
				WHERE generation.id = embedding_jobs.generation_id
				  AND (
					generation.status IN ('active', 'building')
					OR (
						generation.status = 'standby'
						AND generation.standby_until > $5
					)
				  )
			)
	`
	result, err := conn(ctx, r.db).ExecContext(
		ctx,
		query,
		generationID,
		documentID,
		claimToken,
		leaseUntil,
		now,
	)
	if err != nil {
		return false, fmt.Errorf("renew embedding claim: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("embedding renew rows affected: %w", err)
	}
	return affected == 1, nil
}

const lockEmbeddingClaimQuery = `
	SELECT
		job.status,
		COALESCE(job.claim_token::text, ''),
		job.desired_content_hash,
		document.content_hash,
		document.content_revision,
		document.state,
		generation.status,
		generation.standby_until,
		generation.profile_id,
		profile.fingerprint
	FROM embedding_jobs AS job
	JOIN documents AS document
		ON document.id = job.document_id
		AND document.user_id = job.user_id
	JOIN embedding_generations AS generation
		ON generation.id = job.generation_id
	JOIN embedding_profiles AS profile
		ON profile.id = generation.profile_id
	WHERE job.generation_id = $1::uuid
		AND job.document_id = $2
		AND job.user_id = $3
	FOR UPDATE OF job
`

const deletePreviousEmbeddingChunksQuery = `
	DELETE FROM chunk_embeddings_v2
	WHERE generation_id = $1::uuid AND document_id = $2
`

const upsertDocumentEmbeddingIndexQuery = `
	INSERT INTO document_embedding_indexes (
		generation_id, document_id, user_id,
		indexed_content_hash, indexed_revision,
		dimensions, chunk_count, centroid, indexed_at
	)
	VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT (generation_id, document_id) DO UPDATE SET
		user_id = EXCLUDED.user_id,
		indexed_content_hash = EXCLUDED.indexed_content_hash,
		indexed_revision = EXCLUDED.indexed_revision,
		dimensions = EXCLUDED.dimensions,
		chunk_count = EXCLUDED.chunk_count,
		centroid = EXCLUDED.centroid,
		indexed_at = EXCLUDED.indexed_at
`

const finishEmbeddingJobQuery = `
	UPDATE embedding_jobs
	SET status = 'succeeded',
		desired_revision = $5,
		claim_token = NULL,
		lease_until = 0,
		last_error_code = '',
		last_error_message = '',
		mtime = $6
	WHERE generation_id = $1::uuid
		AND document_id = $2
		AND user_id = $3
		AND claim_token = $4::uuid
		AND status = 'running'
`

type lockedEmbeddingClaim struct {
	status              string
	token               string
	desiredHash         string
	documentHash        string
	documentRevision    int64
	documentState       int
	generationStatus    string
	standbyUntil        int64
	generationProfileID string
	profileFingerprint  string
}

func (r *EmbeddingV2Repo) CompleteClaim(
	ctx context.Context,
	claim model.EmbeddingJobClaim,
	chunks []model.ChunkEmbeddingV2,
	centroid []float32,
	now int64,
) (bool, error) {
	applied := false
	err := RunInTx(ctx, r.db, func(txCtx context.Context) error {
		completed, err := r.completeClaimTx(
			txCtx,
			claim,
			chunks,
			centroid,
			now,
		)
		if err != nil {
			return err
		}
		applied = completed
		return nil
	})
	if err != nil {
		return false, err
	}
	return applied, nil
}

func (r *EmbeddingV2Repo) completeClaimTx(
	ctx context.Context,
	claim model.EmbeddingJobClaim,
	chunks []model.ChunkEmbeddingV2,
	centroid []float32,
	now int64,
) (bool, error) {
	locked, found, err := r.lockEmbeddingClaim(ctx, claim)
	if err != nil {
		return false, err
	}
	if !found || !locked.matches(claim, now) {
		return false, nil
	}
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		deletePreviousEmbeddingChunksQuery,
		claim.GenerationID,
		claim.DocumentID,
	); err != nil {
		return false, fmt.Errorf("delete previous embedding chunks: %w", err)
	}
	if err := r.insertChunks(ctx, claim, chunks, now); err != nil {
		return false, err
	}
	var centroidValue any
	if len(centroid) > 0 {
		centroidValue = pgvector.NewVector(centroid)
	}
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		upsertDocumentEmbeddingIndexQuery,
		claim.GenerationID,
		claim.DocumentID,
		claim.UserID,
		claim.DesiredContentHash,
		locked.documentRevision,
		claim.Profile.Dimensions,
		len(chunks),
		centroidValue,
		now,
	); err != nil {
		return false, fmt.Errorf("upsert document embedding index: %w", err)
	}
	result, err := conn(ctx, r.db).ExecContext(
		ctx,
		finishEmbeddingJobQuery,
		claim.GenerationID,
		claim.DocumentID,
		claim.UserID,
		claim.ClaimToken,
		locked.documentRevision,
		now,
	)
	if err != nil {
		return false, fmt.Errorf("finish embedding job: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("finish embedding rows affected: %w", err)
	}
	if affected != 1 {
		return false, errEmbeddingClaimChanged
	}
	return true, nil
}

func (r *EmbeddingV2Repo) lockEmbeddingClaim(
	ctx context.Context,
	claim model.EmbeddingJobClaim,
) (lockedEmbeddingClaim, bool, error) {
	var locked lockedEmbeddingClaim
	err := conn(ctx, r.db).QueryRowContext(
		ctx,
		lockEmbeddingClaimQuery,
		claim.GenerationID,
		claim.DocumentID,
		claim.UserID,
	).Scan(
		&locked.status,
		&locked.token,
		&locked.desiredHash,
		&locked.documentHash,
		&locked.documentRevision,
		&locked.documentState,
		&locked.generationStatus,
		&locked.standbyUntil,
		&locked.generationProfileID,
		&locked.profileFingerprint,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return lockedEmbeddingClaim{}, false, nil
	}
	if err != nil {
		return lockedEmbeddingClaim{}, false, fmt.Errorf(
			"lock embedding claim: %w",
			err,
		)
	}
	return locked, true, nil
}

func (locked lockedEmbeddingClaim) matches(
	claim model.EmbeddingJobClaim,
	now int64,
) bool {
	return locked.status == string(model.EmbeddingJobRunning) &&
		locked.token == claim.ClaimToken &&
		locked.desiredHash == claim.DesiredContentHash &&
		locked.documentHash == claim.DesiredContentHash &&
		locked.documentState == DocumentStateNormal &&
		locked.generationProfileID == claim.Profile.ID &&
		locked.profileFingerprint == claim.Profile.Fingerprint &&
		generationAcceptsEmbeddingWrites(
			model.EmbeddingGenerationStatus(locked.generationStatus),
			locked.standbyUntil,
			now,
		)
}

func (r *EmbeddingV2Repo) insertChunks(
	ctx context.Context,
	claim model.EmbeddingJobClaim,
	chunks []model.ChunkEmbeddingV2,
	now int64,
) error {
	const maxBatchSize = 500
	for start := 0; start < len(chunks); start += maxBatchSize {
		end := start + maxBatchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		values := make([]string, 0, end-start)
		args := make([]any, 0, (end-start)*9)
		for index, chunk := range chunks[start:end] {
			base := index*9 + 1
			values = append(values, fmt.Sprintf(
				"($%d::uuid, $%d::text, $%d::text, $%d::integer, "+
					"$%d::text, $%d::text, $%d::integer, $%d::integer, $%d::vector)",
				base,
				base+1,
				base+2,
				base+3,
				base+4,
				base+5,
				base+6,
				base+7,
				base+8,
			))
			args = append(
				args,
				claim.GenerationID,
				claim.DocumentID,
				claim.UserID,
				chunk.Position,
				string(chunk.ChunkType),
				chunk.Content,
				chunk.TokenCount,
				claim.Profile.Dimensions,
				pgvector.NewVector(chunk.Embedding),
			)
		}
		query := `
			INSERT INTO chunk_embeddings_v2 (
				generation_id, document_id, user_id, position,
				chunk_type, content, token_count, dimensions, embedding, ctime
			)
			SELECT batch.generation_id, batch.document_id, batch.user_id,
				batch.position, batch.chunk_type, batch.content,
				batch.token_count, batch.dimensions, batch.embedding, $` +
			fmt.Sprint(len(args)+1) + `
			FROM (VALUES ` + strings.Join(values, ",") + `) AS batch(
				generation_id, document_id, user_id, position,
				chunk_type, content, token_count, dimensions, embedding
			)
		`
		args = append(args, now)
		if _, err := conn(ctx, r.db).ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("insert embedding chunks: %w", err)
		}
	}
	return nil
}

func (r *EmbeddingV2Repo) MarkClaimFailed(
	ctx context.Context,
	generationID, documentID, claimToken string,
	code, message string,
	retryAt, now int64,
	maxAttempts int,
	permanent bool,
) (bool, error) {
	if len(code) > 64 {
		code = code[:64]
	}
	if len(message) > 500 {
		message = message[:500]
	}
	const query = `
		UPDATE embedding_jobs
		SET status = CASE
				WHEN $8 OR attempts >= $7 THEN 'dead'
				ELSE 'failed'
			END,
			available_at = $6,
			claim_token = NULL,
			lease_until = 0,
			last_error_code = $4,
			last_error_message = $5,
			mtime = $9
		WHERE generation_id = $1::uuid
			AND document_id = $2
			AND claim_token = $3::uuid
			AND status = 'running'
	`
	result, err := conn(ctx, r.db).ExecContext(
		ctx,
		query,
		generationID,
		documentID,
		claimToken,
		code,
		message,
		retryAt,
		maxAttempts,
		permanent,
		now,
	)
	if err != nil {
		return false, fmt.Errorf("mark embedding claim failed: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("embedding failure rows affected: %w", err)
	}
	return affected == 1, nil
}

func (r *EmbeddingV2Repo) RetryJobs(
	ctx context.Context, generationID, documentID string, now int64,
) (int64, error) {
	query := `
		UPDATE embedding_jobs
		SET status = 'pending',
			available_at = $2,
			attempts = 0,
			claim_token = NULL,
			lease_until = 0,
			last_error_code = '',
			last_error_message = '',
			mtime = $2
		WHERE generation_id = $1::uuid
			AND status IN ('failed', 'dead')
			AND EXISTS (
				SELECT 1
				FROM embedding_generations AS generation
				WHERE generation.id = embedding_jobs.generation_id
				  AND (
					generation.status IN ('active', 'building')
					OR (
						generation.status = 'standby'
						AND generation.standby_until > $2
					)
				  )
			)
	`
	args := []any{generationID, now}
	if documentID != "" {
		query += " AND document_id = $3"
		args = append(args, documentID)
	}
	result, err := conn(ctx, r.db).ExecContext(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("retry embedding jobs: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("embedding retry rows affected: %w", err)
	}
	return affected, nil
}

const embeddingGenerationStatsQuery = `
	SELECT
		(SELECT COUNT(*) FROM documents WHERE state = $2),
		(SELECT COUNT(*)
		 FROM document_embedding_indexes AS index
		 JOIN documents AS document
		   ON document.id = index.document_id
		  AND document.user_id = index.user_id
		 JOIN embedding_jobs AS current_job
		   ON current_job.generation_id = index.generation_id
		  AND current_job.document_id = index.document_id
		  AND current_job.user_id = index.user_id
		 WHERE index.generation_id = $1::uuid
		   AND document.state = $2
		   AND current_job.status = 'succeeded'
		   AND current_job.desired_content_hash = index.indexed_content_hash
		   AND index.indexed_content_hash = document.content_hash),
		COUNT(*) FILTER (WHERE job.status = 'pending'),
		COUNT(*) FILTER (WHERE job.status = 'running'),
		COUNT(*) FILTER (WHERE job.status = 'failed'),
		COUNT(*) FILTER (WHERE job.status = 'dead'),
		COUNT(*) FILTER (WHERE job.status = 'succeeded'),
		(SELECT COUNT(*)
		 FROM documents AS document
		 LEFT JOIN embedding_jobs AS missing_job
		   ON missing_job.generation_id = $1::uuid
		  AND missing_job.document_id = document.id
		 WHERE document.state = $2
		   AND missing_job.document_id IS NULL),
		(SELECT COUNT(*)
		 FROM document_embedding_indexes AS index
		 JOIN documents AS document
		   ON document.id = index.document_id
		  AND document.user_id = index.user_id
		 WHERE index.generation_id = $1::uuid
		   AND document.state = $2
		   AND index.indexed_content_hash <> document.content_hash),
		COALESCE(MIN(job.available_at) FILTER (
			WHERE job.status IN ('pending', 'failed')
			  AND job.available_at <= $3
		), 0)
	FROM embedding_jobs AS job
	WHERE job.generation_id = $1::uuid
`

func (r *EmbeddingV2Repo) GenerationStats(
	ctx context.Context, generationID string, now int64,
) (*model.EmbeddingGenerationStats, error) {
	generation, err := r.GetGeneration(ctx, generationID)
	if err != nil {
		return nil, err
	}
	profile, err := r.GetProfile(ctx, generation.ProfileID)
	if err != nil {
		return nil, err
	}
	stats := &model.EmbeddingGenerationStats{
		Generation: *generation,
		Profile:    *profile,
	}
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		embeddingGenerationStatsQuery,
		generationID,
		DocumentStateNormal,
		now,
	).Scan(
		&stats.NormalDocuments,
		&stats.Current,
		&stats.Pending,
		&stats.Running,
		&stats.Failed,
		&stats.Dead,
		&stats.Succeeded,
		&stats.Missing,
		&stats.HashDrift,
		&stats.OldestReadyAt,
	); err != nil {
		return nil, fmt.Errorf("scan embedding generation stats: %w", err)
	}
	stats.CanActivate = generation.Status == model.EmbeddingGenerationBuilding &&
		stats.Current == stats.NormalDocuments &&
		stats.Pending == 0 &&
		stats.Running == 0 &&
		stats.Failed == 0 &&
		stats.Dead == 0 &&
		stats.Missing == 0 &&
		stats.HashDrift == 0
	return stats, nil
}

func (r *EmbeddingV2Repo) ActivateGeneration(
	ctx context.Context, generationID string, now, standbySeconds int64,
) error {
	return RunInTx(ctx, r.db, func(txCtx context.Context) error {
		if err := r.lockEmbeddingControlTables(txCtx); err != nil {
			return err
		}
		stats, err := r.GenerationStats(txCtx, generationID, now)
		if err != nil {
			return err
		}
		if !stats.CanActivate {
			return fmt.Errorf("%w: generation=%s", errEmbeddingGenerationNotReady, generationID)
		}
		if _, err := conn(txCtx, r.db).ExecContext(
			txCtx,
			`UPDATE embedding_generations
			 SET status = 'standby', standby_until = $1, mtime = $2
			 WHERE status = 'active'`,
			now+standbySeconds,
			now,
		); err != nil {
			return fmt.Errorf("move active generation to standby: %w", err)
		}
		result, err := conn(txCtx, r.db).ExecContext(
			txCtx,
			`UPDATE embedding_generations
			 SET status = 'active', standby_until = 0,
			     activated_at = $2, mtime = $2
			 WHERE id = $1::uuid AND status = 'building'`,
			generationID,
			now,
		)
		if err != nil {
			return fmt.Errorf("activate embedding generation: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("activate generation rows affected: %w", err)
		}
		if affected != 1 {
			return errEmbeddingGenerationTransition
		}
		return nil
	})
}

func (r *EmbeddingV2Repo) RollbackGeneration(
	ctx context.Context, generationID string, now, standbySeconds int64,
) error {
	return RunInTx(ctx, r.db, func(txCtx context.Context) error {
		if err := r.lockEmbeddingControlTables(txCtx); err != nil {
			return err
		}
		stats, err := r.GenerationStats(txCtx, generationID, now)
		if err != nil {
			return err
		}
		if !generationReadyForRollback(stats, now) {
			return fmt.Errorf("%w: generation=%s", errEmbeddingGenerationNotReady, generationID)
		}
		if _, err := conn(txCtx, r.db).ExecContext(
			txCtx,
			`UPDATE embedding_generations
			 SET status = 'standby', standby_until = $1, mtime = $2
			 WHERE status = 'active'`,
			now+standbySeconds,
			now,
		); err != nil {
			return fmt.Errorf("move current generation to standby: %w", err)
		}
		result, err := conn(txCtx, r.db).ExecContext(
			txCtx,
			`UPDATE embedding_generations
			 SET status = 'active', standby_until = 0,
			     activated_at = $2, mtime = $2
			 WHERE id = $1::uuid AND status = 'standby'`,
			generationID,
			now,
		)
		if err != nil {
			return fmt.Errorf("rollback embedding generation: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("rollback generation rows affected: %w", err)
		}
		if affected != 1 {
			return errEmbeddingGenerationTransition
		}
		return nil
	})
}

func generationReadyForRollback(
	stats *model.EmbeddingGenerationStats,
	now int64,
) bool {
	return stats.Generation.Status == model.EmbeddingGenerationStandby &&
		stats.Generation.StandbyUntil > now &&
		stats.Current == stats.NormalDocuments &&
		stats.Pending == 0 &&
		stats.Running == 0 &&
		stats.Failed == 0 &&
		stats.Dead == 0 &&
		stats.Missing == 0 &&
		stats.HashDrift == 0
}

func (r *EmbeddingV2Repo) RetireGeneration(
	ctx context.Context, generationID string, now int64,
) error {
	const query = `
		WITH retired AS (
			UPDATE embedding_generations
			SET status = 'retired', mtime = $2
			WHERE id = $1::uuid
			  AND status = 'standby'
			  AND standby_until <= $2
			RETURNING id
		),
		fenced AS (
			UPDATE embedding_jobs AS job
			SET status = 'dead',
			    claim_token = NULL,
			    lease_until = 0,
			    last_error_code = 'generation_retired',
			    last_error_message = 'embedding generation was retired',
			    mtime = $2
			FROM retired
			WHERE job.generation_id = retired.id
			  AND job.status = 'running'
			RETURNING job.document_id
		)
		SELECT COUNT(*) FROM retired
	`
	var affected int64
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		query,
		generationID,
		now,
	).Scan(&affected); err != nil {
		return fmt.Errorf("retire embedding generation: %w", err)
	}
	if affected != 1 {
		return errEmbeddingGenerationTransition
	}
	return nil
}

func (r *EmbeddingV2Repo) RetireExpiredStandbys(
	ctx context.Context,
	now int64,
) (int64, error) {
	const query = `
		WITH retired AS (
			UPDATE embedding_generations
			SET status = 'retired', mtime = $1
			WHERE status = 'standby' AND standby_until <= $1
			RETURNING id
		),
		fenced AS (
			UPDATE embedding_jobs AS job
			SET status = 'dead',
			    claim_token = NULL,
			    lease_until = 0,
			    last_error_code = 'generation_retired',
			    last_error_message = 'embedding generation was retired',
			    mtime = $1
			FROM retired
			WHERE job.generation_id = retired.id
			  AND job.status = 'running'
			RETURNING job.document_id
		)
		SELECT COUNT(*) FROM retired
	`
	var affected int64
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		query,
		now,
	).Scan(&affected); err != nil {
		return 0, fmt.Errorf("retire expired embedding generations: %w", err)
	}
	return affected, nil
}

const selectInactiveEmbeddingGenerationQuery = `
	SELECT id::text
	FROM embedding_generations
	WHERE status IN ('retired', 'failed') AND mtime <= $1
	ORDER BY mtime, id
	FOR UPDATE SKIP LOCKED
	LIMIT 1
`

const cleanupRetiredEmbeddingChunksQuery = `
	WITH batch AS (
		SELECT ctid
		FROM chunk_embeddings_v2
		WHERE generation_id = $1::uuid
		LIMIT $2
	)
	DELETE FROM chunk_embeddings_v2
	WHERE ctid IN (SELECT ctid FROM batch)
`

const cleanupRetiredEmbeddingJobsQuery = `
	WITH batch AS (
		SELECT ctid
		FROM embedding_jobs
		WHERE generation_id = $1::uuid
		LIMIT $2
	)
	DELETE FROM embedding_jobs
	WHERE ctid IN (SELECT ctid FROM batch)
`

const cleanupRetiredEmbeddingIndexesQuery = `
	WITH batch AS (
		SELECT ctid
		FROM document_embedding_indexes
		WHERE generation_id = $1::uuid
		LIMIT $2
	)
	DELETE FROM document_embedding_indexes
	WHERE ctid IN (SELECT ctid FROM batch)
`

const deleteInactiveEmbeddingGenerationQuery = `
	DELETE FROM embedding_generations
	WHERE id = $1::uuid
	  AND status IN ('retired', 'failed')
	  AND mtime <= $2
`

func (r *EmbeddingV2Repo) CleanupRetiredGenerationBatch(
	ctx context.Context,
	cutoff int64,
	limit int,
) (int64, error) {
	if limit <= 0 {
		return 0, nil
	}
	var deleted int64
	err := RunInTx(ctx, r.db, func(txCtx context.Context) error {
		affected, err := r.cleanupRetiredGenerationTx(txCtx, cutoff, limit)
		deleted = affected
		return err
	})
	if err != nil {
		return 0, err
	}
	return deleted, nil
}

func (r *EmbeddingV2Repo) cleanupRetiredGenerationTx(
	ctx context.Context,
	cutoff int64,
	limit int,
) (int64, error) {
	var generationID string
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		selectInactiveEmbeddingGenerationQuery,
		cutoff,
	).Scan(&generationID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, fmt.Errorf("select retired embedding generation: %w", err)
	}
	// Preserve audit invariants between bounded cleanup calls. Chunks must
	// disappear before their index rows, and succeeded jobs must disappear
	// before indexes. Returning after the first non-empty batch also keeps
	// each transaction bounded by limit rather than limit per table.
	queries := []string{
		cleanupRetiredEmbeddingChunksQuery,
		cleanupRetiredEmbeddingJobsQuery,
		cleanupRetiredEmbeddingIndexesQuery,
	}
	for _, query := range queries {
		result, err := conn(ctx, r.db).ExecContext(
			ctx,
			query,
			generationID,
			limit,
		)
		if err != nil {
			return 0, fmt.Errorf("delete retired embedding data: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return 0, fmt.Errorf("retired embedding cleanup rows affected: %w", err)
		}
		if affected > 0 {
			return affected, nil
		}
	}
	result, err := conn(ctx, r.db).ExecContext(
		ctx,
		deleteInactiveEmbeddingGenerationQuery,
		generationID,
		cutoff,
	)
	if err != nil {
		return 0, fmt.Errorf("delete empty retired embedding generation: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("retired generation rows affected: %w", err)
	}
	return affected, nil
}

func (r *EmbeddingV2Repo) lockEmbeddingControlTables(ctx context.Context) error {
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		"SELECT pg_advisory_xact_lock($1)",
		embeddingGenerationControlLock,
	); err != nil {
		return fmt.Errorf("lock embedding generation control: %w", err)
	}
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		`LOCK TABLE documents, embedding_jobs, document_embedding_indexes
		 IN SHARE MODE`,
	); err != nil {
		return fmt.Errorf("lock embedding activation tables: %w", err)
	}
	return nil
}
