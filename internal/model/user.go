package model

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Ctime        int64  `json:"ctime"`
	Mtime        int64  `json:"mtime"`
}
