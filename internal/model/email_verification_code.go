package model

type EmailVerificationCode struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Purpose   string `json:"purpose"`
	CodeHash  string `json:"code_hash"`
	Used      int    `json:"used"`
	Ctime     int64  `json:"ctime"`
	ExpiresAt int64  `json:"expires_at"`
}
