package model

type EmbeddingGenerationStatus string

const (
	EmbeddingGenerationBuilding EmbeddingGenerationStatus = "building"
	EmbeddingGenerationActive   EmbeddingGenerationStatus = "active"
	EmbeddingGenerationStandby  EmbeddingGenerationStatus = "standby"
	EmbeddingGenerationRetired  EmbeddingGenerationStatus = "retired"
	EmbeddingGenerationFailed   EmbeddingGenerationStatus = "failed"
)

type EmbeddingJobStatus string

const (
	EmbeddingJobPending   EmbeddingJobStatus = "pending"
	EmbeddingJobRunning   EmbeddingJobStatus = "running"
	EmbeddingJobFailed    EmbeddingJobStatus = "failed"
	EmbeddingJobDead      EmbeddingJobStatus = "dead"
	EmbeddingJobSucceeded EmbeddingJobStatus = "succeeded"
)

type EmbeddingProfile struct {
	ID               string `json:"id"`
	Fingerprint      string `json:"fingerprint"`
	SpaceID          string `json:"space_id"`
	Model            string `json:"model"`
	Dimensions       int    `json:"dimensions"`
	Metric           string `json:"metric"`
	QueryTaskType    string `json:"query_task_type"`
	DocumentTaskType string `json:"document_task_type"`
	ChunkerVersion   int    `json:"chunker_version"`
	Ctime            int64  `json:"ctime"`
}

type EmbeddingGeneration struct {
	ID           string                    `json:"id"`
	ProfileID    string                    `json:"profile_id"`
	Status       EmbeddingGenerationStatus `json:"status"`
	Reason       string                    `json:"reason"`
	StandbyUntil int64                     `json:"standby_until"`
	Ctime        int64                     `json:"ctime"`
	Mtime        int64                     `json:"mtime"`
	ActivatedAt  int64                     `json:"activated_at"`
}

type EmbeddingJob struct {
	GenerationID       string             `json:"generation_id"`
	DocumentID         string             `json:"document_id"`
	UserID             string             `json:"user_id"`
	DesiredContentHash string             `json:"desired_content_hash"`
	DesiredRevision    int64              `json:"desired_revision"`
	Status             EmbeddingJobStatus `json:"status"`
	AvailableAt        int64              `json:"available_at"`
	Attempts           int                `json:"attempts"`
	ClaimToken         string             `json:"claim_token"`
	LeaseUntil         int64              `json:"lease_until"`
	LastErrorCode      string             `json:"last_error_code"`
	LastErrorMessage   string             `json:"last_error_message"`
	Ctime              int64              `json:"ctime"`
	Mtime              int64              `json:"mtime"`
}

type EmbeddingJobClaim struct {
	EmbeddingJob
	GenerationStatus EmbeddingGenerationStatus `json:"generation_status"`
	Profile          EmbeddingProfile          `json:"profile"`
	Title            string                    `json:"-"`
	Content          string                    `json:"-"`
}

type DocumentEmbeddingIndex struct {
	GenerationID       string    `json:"generation_id"`
	DocumentID         string    `json:"document_id"`
	UserID             string    `json:"user_id"`
	IndexedContentHash string    `json:"indexed_content_hash"`
	IndexedRevision    int64     `json:"indexed_revision"`
	Dimensions         int       `json:"dimensions"`
	ChunkCount         int       `json:"chunk_count"`
	Centroid           []float32 `json:"centroid,omitempty"`
	IndexedAt          int64     `json:"indexed_at"`
}

const (
	ChunkTypeTitle ChunkType = "title"
)

type ChunkEmbeddingV2 struct {
	GenerationID string    `json:"generation_id"`
	DocumentID   string    `json:"document_id"`
	UserID       string    `json:"user_id"`
	Position     int       `json:"position"`
	ChunkType    ChunkType `json:"chunk_type"`
	Content      string    `json:"content"`
	TokenCount   int       `json:"token_count"`
	Dimensions   int       `json:"dimensions"`
	Embedding    []float32 `json:"embedding"`
	Ctime        int64     `json:"ctime"`
}

type SemanticChunkResult struct {
	DocumentID  string
	Score       float32
	ChunkType   ChunkType
	MatchedText string
	SearchPath  string
}

type SemanticSearchMatch struct {
	DocumentID     string
	Score          float32
	MatchedExcerpt string
	MatchType      string
}

type SimilarDocumentResult struct {
	DocumentID string
	Score      float32
}

type EmbeddingCacheV2 struct {
	ProfileID   string
	TaskType    string
	ContentHash string
	Dimensions  int
	Embedding   []float32
	Ctime       int64
}

type EmbeddingProviderCooldown struct {
	ProfileID     string `json:"profile_id"`
	ProviderName  string `json:"provider_name"`
	BlockedUntil  int64  `json:"blocked_until"`
	LastErrorCode string `json:"last_error_code"`
	Mtime         int64  `json:"mtime"`
}

type EmbeddingGenerationStats struct {
	Generation      EmbeddingGeneration
	Profile         EmbeddingProfile
	NormalDocuments int64
	Current         int64
	Pending         int64
	Running         int64
	Failed          int64
	Dead            int64
	Succeeded       int64
	Missing         int64
	HashDrift       int64
	OldestReadyAt   int64
	CanActivate     bool
}
