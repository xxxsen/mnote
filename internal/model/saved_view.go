package model

type SavedView struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	Name        string `json:"name"`
	Search      string `json:"search"`
	TagID       string `json:"tag_id"`
	ShowStarred int    `json:"show_starred"`
	ShowShared  int    `json:"show_shared"`
	Ctime       int64  `json:"ctime"`
	Mtime       int64  `json:"mtime"`
}
