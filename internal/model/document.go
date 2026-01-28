package model

type Document struct {
	ID      string `json:"id"`
	UserID  string `json:"user_id"`
	Title   string `json:"title"`
	Content string `json:"content"`
	Summary string `json:"summary"`
	State   int    `json:"state"`
	Pinned  int    `json:"pinned"`
	Ctime   int64  `json:"ctime"`
	Mtime   int64  `json:"mtime"`
}
