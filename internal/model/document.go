package model

type Document struct {
	ID              string `json:"id"`
	UserID          string `json:"user_id"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	Summary         string `json:"summary"`
	State           int    `json:"state"`
	Pinned          int    `json:"pinned"`
	Starred         int    `json:"starred"`
	Ctime           int64  `json:"ctime"`
	Mtime           int64  `json:"mtime"`
	ContentHash     string `json:"content_hash"`
	ContentMtime    int64  `json:"content_mtime"`
	ContentRevision int64  `json:"content_revision"`
}

type SaveDocumentResult struct {
	ID              string `json:"id"`
	ContentRevision int64  `json:"content_revision"`
	ContentHash     string `json:"content_hash"`
	ContentMtime    int64  `json:"content_mtime"`
	Mtime           int64  `json:"mtime"`
}

type ConflictInfo struct {
	ID              string `json:"id"`
	ContentRevision int64  `json:"content_revision"`
	ContentHash     string `json:"content_hash"`
	ContentMtime    int64  `json:"content_mtime"`
}
