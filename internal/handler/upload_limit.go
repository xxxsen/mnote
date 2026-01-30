package handler

import "strconv"

func formatUploadLimit(bytes int64) string {
	const mb = 1024 * 1024
	if bytes <= 0 {
		return "0MB"
	}
	value := bytes / mb
	if value <= 0 {
		value = 1
	}
	return strconv.FormatInt(value, 10) + "MB"
}
