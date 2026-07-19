package service

import (
	"net/mail"
	"strings"
	"unicode/utf8"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

const (
	maxEmailBytes    = 254
	minPasswordBytes = 8
	maxPasswordBytes = 72
)

func NormalizeEmail(value string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" || len(normalized) > maxEmailBytes ||
		!utf8.ValidString(normalized) || strings.ContainsAny(normalized, "\r\n") {
		return "", appErr.ErrInvalid
	}
	address, err := mail.ParseAddress(normalized)
	if err != nil || address.Name != "" || address.Address != normalized {
		return "", appErr.ErrInvalid
	}
	local, domain, ok := strings.Cut(normalized, "@")
	if !ok || local == "" || domain == "" || strings.Contains(domain, "..") {
		return "", appErr.ErrInvalid
	}
	return normalized, nil
}

func validateNewPassword(value string) error {
	if len(value) < minPasswordBytes || len(value) > maxPasswordBytes {
		return appErr.ErrInvalid
	}
	return nil
}
