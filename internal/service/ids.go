package service

import (
	"crypto/rand"
	"encoding/hex"
)

func newID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func newToken() string {
	bytes := make([]byte, 20)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
