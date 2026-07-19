package model

type OAuthOneTimeToken struct {
	Kind            string
	Digest          string
	Purpose         string
	Provider        string
	UserID          string
	EmailNormalized string
	ReturnTo        string
	ExpiresAt       int64
	ConsumedAt      int64
	Ctime           int64
}
