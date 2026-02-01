package model

type DocumentEmbedding struct {
	DocumentID  string    `json:"document_id"`
	UserID      string    `json:"user_id"`
	Embedding   []float32 `json:"embedding"`
	ContentHash string    `json:"content_hash"`
	Mtime       int64     `json:"mtime"`
}
