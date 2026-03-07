package model

type Todo struct {
	ID      string `json:"id"`
	UserID  string `json:"user_id"`
	Content string `json:"content"`
	DueDate string `json:"due_date"`
	Done    int    `json:"done"`
	Ctime   int64  `json:"ctime"`
	Mtime   int64  `json:"mtime"`
}
