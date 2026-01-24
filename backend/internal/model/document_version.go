package model

type DocumentVersion struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	DocumentID string `json:"document_id"`
	Version    int    `json:"version"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	Ctime      int64  `json:"ctime"`
}
