package model

type OAuthAccount struct {
	ID             string `json:"id"`
	UserID         string `json:"user_id"`
	Provider       string `json:"provider"`
	ProviderUserID string `json:"provider_user_id"`
	Email          string `json:"email"`
	Ctime          int64  `json:"ctime"`
	Mtime          int64  `json:"mtime"`
}
