package errors

import "errors"

var (
	ErrNotFound           = errors.New("not found")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalid            = errors.New("invalid")
	ErrConflict           = errors.New("conflict")
	ErrTooMany            = errors.New("too many requests")
	ErrInternal           = errors.New("internal")
	ErrImportTooManyNotes = errors.New("import too many notes")
	ErrImportNoteTooLarge = errors.New("import note too large")
	ErrImportInvalidJSON  = errors.New("import invalid json")
)

func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

func IsConflict(err error) bool {
	return errors.Is(err, ErrConflict)
}
