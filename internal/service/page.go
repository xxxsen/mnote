package service

type Page struct {
	Limit  int
	Offset int
}

func (page Page) Clamp(defaultLimit, maxLimit int) Page {
	if page.Limit <= 0 {
		page.Limit = defaultLimit
	}
	if page.Limit > maxLimit {
		page.Limit = maxLimit
	}
	if page.Offset < 0 {
		page.Offset = 0
	}
	return page
}
