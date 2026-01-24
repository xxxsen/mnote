package model

type Share struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	DocumentID string `json:"document_id"`
	Token      string `json:"token"`
	State      int    `json:"state"`
	Ctime      int64  `json:"ctime"`
	Mtime      int64  `json:"mtime"`
}
