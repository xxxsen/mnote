package errors

import (
	"errors"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
)

type AppError struct {
	code    uint32
	message string
	cause   error
}

func (e *AppError) Error() string {
	if e == nil {
		return ""
	}
	if e.cause == nil {
		return e.message
	}
	if e.message == "" {
		return e.cause.Error()
	}
	return e.message + ": " + e.cause.Error()
}

func (e *AppError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func (e *AppError) Is(target error) bool {
	t, ok := target.(*AppError)
	if !ok || e == nil || t == nil {
		return false
	}
	return e.code == t.code
}

func (e *AppError) Code() uint32 {
	if e == nil {
		return errcode.ErrInternal
	}
	return e.code
}

func (e *AppError) Message() string {
	if e == nil {
		return "internal error"
	}
	return e.message
}

func New(code uint32, message string) *AppError {
	return &AppError{
		code:    code,
		message: message,
	}
}

func Wrap(base *AppError, message string, cause error) *AppError {
	if base == nil {
		base = ErrInternal
	}
	if message == "" {
		message = base.message
	}
	return &AppError{
		code:    base.code,
		message: message,
		cause:   cause,
	}
}

func Normalize(err error) *AppError {
	if err == nil {
		return nil
	}
	var ae *AppError
	if errors.As(err, &ae) {
		return ae
	}
	return Wrap(ErrInternal, ErrInternal.message, err)
}

var (
	ErrNotFound           = New(errcode.ErrNotFound, "not found")
	ErrUnauthorized       = New(errcode.ErrUnauthorized, "unauthorized")
	ErrForbidden          = New(errcode.ErrForbidden, "forbidden")
	ErrInvalid            = New(errcode.ErrInvalid, "invalid request")
	ErrConflict           = New(errcode.ErrConflict, "conflict")
	ErrTooMany            = New(errcode.ErrTooMany, "too many requests")
	ErrInternal           = New(errcode.ErrInternal, "internal error")
	ErrImportTooManyNotes = New(errcode.ErrImportTooManyNotes, "too many notes")
	ErrImportNoteTooLarge = New(errcode.ErrImportNoteTooLarge, "note too large")
	ErrImportInvalidJSON  = New(errcode.ErrImportInvalidJSON, "invalid json")
)

func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

func IsConflict(err error) bool {
	return errors.Is(err, ErrConflict)
}

func IsInvalid(err error) bool {
	return errors.Is(err, ErrInvalid)
}

func WrapInvalid(message string) error {
	return Wrap(ErrInvalid, message, nil)
}
