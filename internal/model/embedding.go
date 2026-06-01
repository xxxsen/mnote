package model

type EmbeddingStatus string

const (
	EmbeddingStatusPending   EmbeddingStatus = "pending"
	EmbeddingStatusRunning   EmbeddingStatus = "running"
	EmbeddingStatusSucceeded EmbeddingStatus = "succeeded"
	EmbeddingStatusFailed    EmbeddingStatus = "failed"
)

type DocumentEmbedding struct {
	DocumentID      string          `json:"document_id"`
	UserID          string          `json:"user_id"`
	ContentHash     string          `json:"content_hash"`
	Mtime           int64           `json:"mtime"`
	EmbeddingStatus EmbeddingStatus `json:"embedding_status"`
	Attempts        int             `json:"attempts"`
	NextRetryAt     int64           `json:"next_retry_at"`
	LockedUntil     int64           `json:"locked_until"`
	LastError       string          `json:"last_error"`
}

type ChunkType string

const (
	ChunkTypeText  ChunkType = "text"
	ChunkTypeCode  ChunkType = "code"
	ChunkTypeMixed ChunkType = "mixed"
)

type ChunkEmbedding struct {
	ChunkID    string    `json:"chunk_id"`
	DocumentID string    `json:"document_id"`
	UserID     string    `json:"user_id"`
	Content    string    `json:"content"`
	Embedding  []float32 `json:"embedding"`
	TokenCount int       `json:"token_count"`
	ChunkType  ChunkType `json:"chunk_type"`
	Position   int       `json:"position"`
	Mtime      int64     `json:"mtime"`
}
