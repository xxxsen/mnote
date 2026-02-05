package errcode

const (
	ErrUnknown = 10000000 + iota
	ErrUnauthorized
	ErrForbidden
	ErrNotFound
	ErrInvalid
	ErrConflict
	ErrTooMany
	ErrInternal
	ErrInvalidFile
	ErrImportFailed
	ErrImportTooManyNotes
	ErrImportNoteTooLarge
	ErrImportInvalidJSON
	ErrUploadFailed
	ErrAIUnavailable
)
