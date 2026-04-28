package jwt

import (
	"testing"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testSecret = []byte("test-secret-key-for-unit-tests")

func TestGenerateAndParseToken(t *testing.T) {
	token, err := GenerateToken("user123", "test@example.com", testSecret, time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := ParseToken(token, testSecret)
	require.NoError(t, err)
	assert.Equal(t, "user123", claims.UserID)
	assert.Equal(t, "test@example.com", claims.Email)
}

func TestParseToken_WrongSecret(t *testing.T) {
	token, err := GenerateToken("user1", "a@b.com", testSecret, time.Hour)
	require.NoError(t, err)

	_, err = ParseToken(token, []byte("wrong-secret"))
	assert.Error(t, err)
}

func TestParseToken_Expired(t *testing.T) {
	token, err := GenerateToken("user1", "a@b.com", testSecret, -time.Hour)
	require.NoError(t, err)

	_, err = ParseToken(token, testSecret)
	assert.Error(t, err)
}

func TestParseToken_InvalidString(t *testing.T) {
	_, err := ParseToken("not.a.valid.token", testSecret)
	assert.Error(t, err)
}

func TestParseToken_EmptyString(t *testing.T) {
	_, err := ParseToken("", testSecret)
	assert.Error(t, err)
}

func TestGenerateToken_EmptyUserID(t *testing.T) {
	token, err := GenerateToken("", "", testSecret, time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := ParseToken(token, testSecret)
	require.NoError(t, err)
	assert.Equal(t, "", claims.UserID)
}

func TestGenerateToken_ZeroTTL(t *testing.T) {
	token, err := GenerateToken("u1", "e@e.com", testSecret, 0)
	require.NoError(t, err)

	_, err = ParseToken(token, testSecret)
	assert.Error(t, err, "zero TTL should produce expired token")
}

func TestParseToken_TamperedToken(t *testing.T) {
	token, err := GenerateToken("u1", "e@e.com", testSecret, time.Hour)
	require.NoError(t, err)

	tampered := token[:len(token)-4] + "XXXX"
	_, err = ParseToken(tampered, testSecret)
	assert.Error(t, err)
}

func TestParseToken_UnexpectedSigningMethod(t *testing.T) {
	claims := Claims{
		UserID: "u1",
		Email:  "e@e.com",
	}
	tok := jwtlib.NewWithClaims(jwtlib.SigningMethodHS384, claims)
	signed, err := tok.SignedString(testSecret)
	require.NoError(t, err)

	_, err = ParseToken(signed, testSecret)
	assert.Error(t, err)
	assert.ErrorIs(t, err, ErrUnexpectedSigningMethod)
}
