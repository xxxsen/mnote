package model

type Template struct {
	ID            string   `json:"id"`
	UserID        string   `json:"user_id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Content       string   `json:"content"`
	DefaultTagIDs []string `json:"default_tag_ids"`
	BuiltIn       int      `json:"built_in"`
	Ctime         int64    `json:"ctime"`
	Mtime         int64    `json:"mtime"`
}

type TemplateMeta struct {
	ID            string   `json:"id"`
	UserID        string   `json:"user_id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	DefaultTagIDs []string `json:"default_tag_ids"`
	BuiltIn       int      `json:"built_in"`
	Ctime         int64    `json:"ctime"`
	Mtime         int64    `json:"mtime"`
}
