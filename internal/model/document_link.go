package model

type LinkedDocument struct {
	ID     string
	Title  string
	Mtime  int64
	Mutual bool
}

type DocumentLinkCursor struct {
	Mtime int64
	ID    string
}

type DocumentLinksQuery struct {
	IncludeIncoming bool
	IncludeOutgoing bool
	IncomingCursor  *DocumentLinkCursor
	OutgoingCursor  *DocumentLinkCursor
	Limit           int
}

type DocumentLinkPage struct {
	Items      []LinkedDocument
	HasMore    bool
	NextCursor string
}

type DocumentLinkCounts struct {
	Incoming int64
	Outgoing int64
	Unique   int64
}

type DocumentLinksResult struct {
	Counts   DocumentLinkCounts
	Incoming *DocumentLinkPage
	Outgoing *DocumentLinkPage
}
