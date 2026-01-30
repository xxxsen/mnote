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
	ErrUploadFailed
	ErrAIUnavailable
)
