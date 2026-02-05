package model

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
	Status         string
	RequireContent bool
	Processed      int
	Total          int
	Tags           []string
	Report         *ImportReport
	Ctime          int64
	Mtime          int64
}

type ImportJobNote struct {
	ID       string
	JobID    string
	UserID   string
	Position int
	Title    string
	Content  string
	Summary  string
	Tags     []string
	Source   string
	Ctime    int64
}
