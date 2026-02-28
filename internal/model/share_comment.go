package model

type ShareComment struct {
	ID         string `json:"id"`
	ShareID    string `json:"share_id"`
	DocumentID string `json:"document_id"`
	Author     string `json:"author"`
	Content    string `json:"content"`
	State      int    `json:"state"`
	Ctime      int64  `json:"ctime"`
	Mtime      int64  `json:"mtime"`
}
