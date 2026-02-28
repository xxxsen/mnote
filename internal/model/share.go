package model

type Share struct {
	ID            string `json:"id"`
	UserID        string `json:"user_id"`
	DocumentID    string `json:"document_id"`
	Token         string `json:"token"`
	State         int    `json:"state"`
	ExpiresAt     int64  `json:"expires_at"`
	PasswordHash  string `json:"-"`
	Permission    int    `json:"permission"`
	AllowDownload int    `json:"allow_download"`
	Ctime         int64  `json:"ctime"`
	Mtime         int64  `json:"mtime"`
}
