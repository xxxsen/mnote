package idgen

import (
	"bytes"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) {
	return 0, errors.New("entropy unavailable")
}

func TestCrypto(t *testing.T) {
	generator := New(bytes.NewReader(bytes.Repeat([]byte{42}, 64)))
	id, err := generator.ID()
	require.NoError(t, err)
	assert.Len(t, id, 32)

	token, err := generator.Token(20)
	require.NoError(t, err)
	assert.Len(t, token, 40)

	digits, err := generator.Digits(6)
	require.NoError(t, err)
	assert.Equal(t, "222222", digits)
}

func TestCryptoFailsClosed(t *testing.T) {
	generator := New(failingReader{})
	_, err := generator.ID()
	assert.Error(t, err)
	_, err = generator.Token(8)
	assert.Error(t, err)
	_, err = generator.Digits(6)
	assert.Error(t, err)
}

func TestCryptoRejectsInvalidLengths(t *testing.T) {
	generator := NewCrypto()
	_, err := generator.Token(0)
	assert.ErrorIs(t, err, ErrInvalidLength)
	_, err = generator.Digits(-1)
	assert.ErrorIs(t, err, ErrInvalidLength)
}
