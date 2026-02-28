package model

type ShareComment struct {
	ID         string `json:"id"`
	ShareID    string `json:"share_id"`
	DocumentID string `json:"document_id"`
	RootID     string `json:"root_id"`
	ReplyToID  string `json:"reply_to_id"`
	Author     string `json:"author"`
	Content    string `json:"content"`
	State      int    `json:"state"`
	ReplyCount int    `json:"reply_count"` // Only populated for root comments
	Ctime      int64  `json:"ctime"`
	Mtime      int64  `json:"mtime"`
}
