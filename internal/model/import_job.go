package model

type ImportStatus string

const (
	ImportStatusParsing ImportStatus = "parsing"
	ImportStatusReady   ImportStatus = "ready"
	ImportStatusRunning ImportStatus = "running"
	ImportStatusDone    ImportStatus = "done"
	ImportStatusFailed  ImportStatus = "failed"
)

func (status ImportStatus) Valid() bool {
	switch status {
	case ImportStatusParsing, ImportStatusReady, ImportStatusRunning,
		ImportStatusDone, ImportStatusFailed:
		return true
	default:
		return false
	}
}

type ImportMode string

const (
	ImportModeSkip      ImportMode = "skip"
	ImportModeOverwrite ImportMode = "overwrite"
	ImportModeAppend    ImportMode = "append"
)

func (mode ImportMode) Valid() bool {
	switch mode {
	case ImportModeSkip, ImportModeOverwrite, ImportModeAppend:
		return true
	default:
		return false
	}
}

type ImportNoteStatus string

const (
	ImportNoteStatusPending ImportNoteStatus = "pending"
	ImportNoteStatusDone    ImportNoteStatus = "done"
	ImportNoteStatusFailed  ImportNoteStatus = "failed"
	ImportNoteStatusSkipped ImportNoteStatus = "skipped"
)

func (status ImportNoteStatus) Valid() bool {
	switch status {
	case ImportNoteStatusPending, ImportNoteStatusDone,
		ImportNoteStatusFailed, ImportNoteStatusSkipped:
		return true
	default:
		return false
	}
}

type ImportNote struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
	Source  string   `json:"source"`
}

type ImportReport struct {
	Created      int      `json:"created"`
	Updated      int      `json:"updated"`
	Skipped      int      `json:"skipped"`
	Failed       int      `json:"failed"`
	Errors       []string `json:"errors"`
	FailedTitles []string `json:"failed_titles"`
}

type ImportJob struct {
	ID             string
	UserID         string
	Source         string
	Status         ImportStatus
	Mode           ImportMode
	RequireContent bool
	Processed      int
	Total          int
	Tags           []string
	Report         *ImportReport
	LockedUntil    int64
	Attempts       int
	NextRetryAt    int64
	LastError      string
	Ctime          int64
	Mtime          int64
}

type ImportJobNote struct {
	ID               string
	JobID            string
	UserID           string
	Position         int
	Title            string
	Content          string
	Summary          string
	Tags             []string
	Source           string
	Status           ImportNoteStatus
	TargetDocumentID string
	ResultAction     string
	LastError        string
	Ctime            int64
	Mtime            int64
}
