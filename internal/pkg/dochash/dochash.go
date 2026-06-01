// Package dochash centralizes the canonical SHA-256 fingerprint of a
// document. The fingerprint feeds three independent code paths — the save
// transaction's content_hash, the embedding worker's expectedHash, and the
// 008 backfill migration — so the byte layout must stay identical across
// all of them. Defining it once here removes the risk of a future drift
// between the Go-side hash and the SQL-side digest()/encode() chain.
package dochash

import (
	"crypto/sha256"
	"encoding/hex"
)

// Compute returns the lower-case hex SHA-256 of "title\ncontent" using a
// single byte 0x0A as the separator. The 008 backfill migration mirrors
// the same expression via digest(title || E'\n' || content, 'sha256').
func Compute(title, content string) string {
	sum := sha256.Sum256([]byte(title + "\n" + content))
	return hex.EncodeToString(sum[:])
}
