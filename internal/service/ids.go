package service

import (
	"crypto/rand"
	"encoding/hex"
)

const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func newID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func newMarkerID() string {
	bytes := make([]byte, 8)
	_, _ = rand.Read(bytes)
	out := make([]byte, 8)
	for i, b := range bytes {
		out[i] = base62Alphabet[int(b)%len(base62Alphabet)]
	}
	return string(out)
}

func newToken() string {
	bytes := make([]byte, 20)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
