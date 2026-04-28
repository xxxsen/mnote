package repo

import (
	"context"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func queryBasicDocuments(ctx context.Context, db DBTX, query string, args ...any) ([]model.Document, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var docs []model.Document
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return docs, nil
}

func insertRow(ctx context.Context, db DBTX, table string, data map[string]any) error {
	sqlStr, args, err := builder.BuildInsert(table, []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if err := dbutil.InsertWithConflictCheck(ctx, db, sqlStr, args, appErr.ErrConflict); err != nil {
		return fmt.Errorf("insert %s: %w", table, err)
	}
	return nil
}
