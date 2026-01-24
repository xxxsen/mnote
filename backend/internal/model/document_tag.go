package model

type DocumentTag struct {
	UserID     string `json:"user_id"`
	DocumentID string `json:"document_id"`
	TagID      string `json:"tag_id"`
}
