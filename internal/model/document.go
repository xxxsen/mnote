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

// SaveDocumentResult is the metadata returned from a save attempt. Accepted
// reports whether the request bumped the document; when Accepted is false
// the caller submitted a save_seq that was already superseded and the
// server preserved the existing snapshot. The remaining fields always
// reflect the post-call server state (current ContentRevision regardless
// of accept/reject), so the client can advance its local save_seq without
// re-fetching the document.
type SaveDocumentResult struct {
	ID              string `json:"id"`
	Accepted        bool   `json:"accepted"`
	ContentRevision int64  `json:"content_revision"`
	ContentHash     string `json:"content_hash"`
	ContentMtime    int64  `json:"content_mtime"`
	Mtime           int64  `json:"mtime"`
}
