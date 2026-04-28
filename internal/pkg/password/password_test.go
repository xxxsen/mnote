package password

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashAndCompare(t *testing.T) {
	plain := "my-secret-password"
	hashed, err := Hash(plain)
	require.NoError(t, err)
	assert.NotEmpty(t, hashed)
	assert.NotEqual(t, plain, hashed)

	assert.NoError(t, Compare(hashed, plain))
}

func TestCompare_WrongPassword(t *testing.T) {
	hashed, err := Hash("correct-password")
	require.NoError(t, err)

	assert.Error(t, Compare(hashed, "wrong-password"))
}

func TestHash_DifferentOutputs(t *testing.T) {
	h1, err := Hash("same-input")
	require.NoError(t, err)
	h2, err := Hash("same-input")
	require.NoError(t, err)

	assert.NotEqual(t, h1, h2, "bcrypt should produce different hashes for the same input")
}

func TestCompare_InvalidHash(t *testing.T) {
	assert.Error(t, Compare("not-a-bcrypt-hash", "password"))
}

func TestHash_EmptyPassword(t *testing.T) {
	hashed, err := Hash("")
	require.NoError(t, err)
	assert.NotEmpty(t, hashed)
	assert.NoError(t, Compare(hashed, ""))
}

func TestCompare_EmptyHash(t *testing.T) {
	assert.Error(t, Compare("", "password"))
}
