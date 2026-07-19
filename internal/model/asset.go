package model

type AssetStatus string

const (
	AssetStatusPending AssetStatus = "pending"
	AssetStatusReady   AssetStatus = "ready"
	AssetStatusFailed  AssetStatus = "failed"
)

func (status AssetStatus) Valid() bool {
	switch status {
	case AssetStatusPending, AssetStatusReady, AssetStatusFailed:
		return true
	default:
		return false
	}
}

type Asset struct {
	ID          string      `json:"id"`
	UserID      string      `json:"user_id"`
	FileKey     string      `json:"file_key"`
	URL         string      `json:"url"`
	Name        string      `json:"name"`
	ContentType string      `json:"content_type"`
	Size        int64       `json:"size"`
	Status      AssetStatus `json:"-"`
	LastError   string      `json:"-"`
	LockedUntil int64       `json:"-"`
	Ctime       int64       `json:"ctime"`
	Mtime       int64       `json:"mtime"`
}
