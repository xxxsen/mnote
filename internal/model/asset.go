package model

type Asset struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	FileKey     string `json:"file_key"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	Ctime       int64  `json:"ctime"`
	Mtime       int64  `json:"mtime"`
}
