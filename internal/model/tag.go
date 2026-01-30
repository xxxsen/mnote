package model

type Tag struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Pinned int    `json:"pinned"`
	Ctime  int64  `json:"ctime"`
	Mtime  int64  `json:"mtime"`
}

type TagSummary struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Pinned int    `json:"pinned"`
	Count  int    `json:"count"`
}
