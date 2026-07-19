package idgen

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

var ErrInvalidLength = errors.New("length must be positive")

type Generator interface {
	ID() (string, error)
	Token(bytes int) (string, error)
	Digits(length int) (string, error)
}

type Crypto struct {
	reader io.Reader
}

func New(reader io.Reader) *Crypto {
	if reader == nil {
		reader = rand.Reader
	}
	return &Crypto{reader: reader}
}

func NewCrypto() *Crypto {
	return New(rand.Reader)
}

func (g *Crypto) ID() (string, error) {
	return g.Token(16)
}

func (g *Crypto) Token(size int) (string, error) {
	if size <= 0 {
		return "", ErrInvalidLength
	}
	buf := make([]byte, size)
	if _, err := io.ReadFull(g.reader, buf); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

func (g *Crypto) Digits(length int) (string, error) {
	if length <= 0 {
		return "", ErrInvalidLength
	}
	result := make([]byte, length)
	random := make([]byte, 1)
	for i := range result {
		for {
			if _, err := io.ReadFull(g.reader, random); err != nil {
				return "", fmt.Errorf("read random digit: %w", err)
			}
			// Rejection sampling avoids modulo bias: 250 is divisible by 10.
			if random[0] < 250 {
				result[i] = '0' + random[0]%10
				break
			}
		}
	}
	return string(result), nil
}
