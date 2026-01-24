package model

type Tag struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Ctime  int64  `json:"ctime"`
	Mtime  int64  `json:"mtime"`
}
