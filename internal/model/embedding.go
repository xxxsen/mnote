package model

type DocumentEmbedding struct {
	DocumentID  string `json:"document_id"`
	UserID      string `json:"user_id"`
	ContentHash string `json:"content_hash"`
	Mtime       int64  `json:"mtime"`
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
