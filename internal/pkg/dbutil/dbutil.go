package dbutil

import (
	"regexp"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

var limitRegex = regexp.MustCompile(`(?i)LIMIT\s+\?\s*,\s*\?`)

func Finalize(query string, args []interface{}) (string, []interface{}) {
	loc := limitRegex.FindStringIndex(query)
	if loc != nil {
		prefix := query[:loc[0]]
		qCount := strings.Count(prefix, "?")
		if qCount+1 < len(args) {
			args[qCount], args[qCount+1] = args[qCount+1], args[qCount]
			query = limitRegex.ReplaceAllString(query, "LIMIT ? OFFSET ?")
		}
	}
	return sqlx.Rebind(sqlx.DOLLAR, query), args
}

func IsConflict(err error) bool {
	if pgErr, ok := err.(*pq.Error); ok {
		return pgErr.Code == "23505"
	}
	return false
}
