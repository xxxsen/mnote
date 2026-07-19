package service

type Limits struct {
	MaxDocumentBytes int
	MaxTemplateBytes int
	MaxJSONBodyBytes int64
}

func DefaultLimits() Limits {
	return Limits{
		MaxDocumentBytes: 1024 * 1024,
		MaxTemplateBytes: 1024 * 1024,
		MaxJSONBodyBytes: 2 * 1024 * 1024,
	}
}

func (limits Limits) withDefaults() Limits {
	defaults := DefaultLimits()
	if limits.MaxDocumentBytes <= 0 {
		limits.MaxDocumentBytes = defaults.MaxDocumentBytes
	}
	if limits.MaxTemplateBytes <= 0 {
		limits.MaxTemplateBytes = defaults.MaxTemplateBytes
	}
	if limits.MaxJSONBodyBytes <= 0 {
		limits.MaxJSONBodyBytes = defaults.MaxJSONBodyBytes
	}
	return limits
}
