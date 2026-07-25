package dochash

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestCompute_StableLayout pins the byte layout of the canonical document
// fingerprint. The same value is produced server-side by the save path and
// inside the 008 backfill migration, so any future tweak that drifts the
// separator, the encoding, or the algorithm must fail this assertion
// before reaching production.
func TestCompute_StableLayout(t *testing.T) {
	got := Compute("hello", "world")
	assert.Len(t, got, 64, "sha256 hex must be 64 lowercase chars")
	const pinned = "26c60a61d01db5836ca70fefd44a6a016620413c8ef5f259a6c5612d4f79d3b8"
	assert.Equal(t, pinned, got, "sha256(title + '\\n' + content) hex must match the canonical anchor")
}

// TestCompute_EmptyInputs guards the boundary cases the save path and the
// embedding worker both rely on: an empty title still participates in the
// hash and an entirely empty document yields a stable seed.
func TestCompute_EmptyInputs(t *testing.T) {
	emptyAll := Compute("", "")
	emptyTitle := Compute("", "body")
	emptyBody := Compute("title", "")
	assert.NotEqual(t, emptyAll, emptyTitle, "empty title must not collide with an empty document")
	assert.NotEqual(t, emptyAll, emptyBody, "empty body must not collide with an empty document")
	assert.NotEqual(t, emptyTitle, emptyBody, "title and body inputs must not be interchangeable")
}

func TestCompute_TitleChangeInvalidatesEmbeddingIdentity(t *testing.T) {
	assert.NotEqual(
		t,
		Compute("First title", "same body"),
		Compute("Second title", "same body"),
	)
}
