package repo

import (
	"context"
	"database/sql"
	"strings"
	"unicode"

	"github.com/didi/gendry/builder"
)

type FTSRepo struct {
	db *sql.DB
}

func NewFTSRepo(db *sql.DB) *FTSRepo {
	return &FTSRepo{db: db}
}

func (r *FTSRepo) Upsert(ctx context.Context, docID, userID, title, content string) error {
	_ = r.Delete(ctx, userID, docID)
	data := map[string]interface{}{
		"document_id": docID,
		"user_id":     userID,
		"title":       title,
		"content":     content,
	}
	sqlStr, args, err := builder.BuildInsert("documents_fts", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *FTSRepo) Delete(ctx context.Context, userID, docID string) error {
	where := map[string]interface{}{"user_id": userID, "document_id": docID}
	sqlStr, args, err := builder.BuildDelete("documents_fts", where)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *FTSRepo) SearchDocIDs(ctx context.Context, userID, query string, limit uint) ([]string, error) {
	cleaned := sanitizeFTSQuery(query)
	if cleaned == "" {
		return []string{}, nil
	}
	where := map[string]interface{}{
		"user_id":       userID,
		"_custom_match": builder.Custom("documents_fts MATCH ?", cleaned),
	}
	if limit > 0 {
		where["_limit"] = []uint{0, limit}
	}
	sqlStr, args, err := builder.BuildSelect("documents_fts", where, []string{"document_id"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func sanitizeFTSQuery(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}
	var builder strings.Builder
	for _, r := range input {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			builder.WriteRune(r)
		case unicode.IsSpace(r):
			builder.WriteRune(' ')
		default:
			builder.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(builder.String()), " ")
}
