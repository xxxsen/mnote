package model

type SummaryStatus string

const (
	SummaryStatusPending   SummaryStatus = "pending"
	SummaryStatusRunning   SummaryStatus = "running"
	SummaryStatusSucceeded SummaryStatus = "succeeded"
	SummaryStatusFailed    SummaryStatus = "failed"
)

func (status SummaryStatus) Valid() bool {
	switch status {
	case SummaryStatusPending, SummaryStatusRunning,
		SummaryStatusSucceeded, SummaryStatusFailed:
		return true
	default:
		return false
	}
}

type SummaryTask struct {
	DocumentID        string
	UserID            string
	Title             string
	Content           string
	SourceContentHash string
	Attempts          int
}
