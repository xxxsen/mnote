package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

var errUnexpectedDocumentLinkDirection = errors.New(
	"unexpected document link direction",
)

const listDocumentLinksQuery = `
WITH current_document AS (
	SELECT id
	FROM documents
	WHERE id = $1 AND user_id = $2 AND state = $3
),
incoming_links AS (
	SELECT
		document.id,
		document.title,
		document.mtime,
		EXISTS (
			SELECT 1
			FROM document_links AS reverse_link
			WHERE reverse_link.source_id = $1
			  AND reverse_link.target_id = document.id
			  AND reverse_link.user_id = $2
		) AS mutual
	FROM current_document
	JOIN document_links AS link
	  ON link.target_id = current_document.id
	 AND link.user_id = $2
	JOIN documents AS document
	  ON document.id = link.source_id
	 AND document.user_id = $2
	 AND document.state = $3
	WHERE document.id <> $1
),
outgoing_links AS (
	SELECT
		document.id,
		document.title,
		document.mtime,
		EXISTS (
			SELECT 1
			FROM document_links AS reverse_link
			WHERE reverse_link.source_id = document.id
			  AND reverse_link.target_id = $1
			  AND reverse_link.user_id = $2
		) AS mutual
	FROM current_document
	JOIN document_links AS link
	  ON link.source_id = current_document.id
	 AND link.user_id = $2
	JOIN documents AS document
	  ON document.id = link.target_id
	 AND document.user_id = $2
	 AND document.state = $3
	WHERE document.id <> $1
),
counts AS (
	SELECT
		EXISTS (SELECT 1 FROM current_document) AS current_exists,
		(SELECT COUNT(*) FROM incoming_links) AS incoming_count,
		(SELECT COUNT(*) FROM outgoing_links) AS outgoing_count,
		(
			SELECT COUNT(DISTINCT related.id)
			FROM (
				SELECT id FROM incoming_links
				UNION ALL
				SELECT id FROM outgoing_links
			) AS related
		) AS unique_count
),
incoming_page AS (
	SELECT 'incoming'::text AS direction, id, title, mtime, mutual
	FROM incoming_links
	WHERE $4::boolean
	  AND (
		$5::bigint IS NULL
		OR mtime < $5
		OR (mtime = $5 AND id < $6)
	  )
	ORDER BY mtime DESC, id DESC
	LIMIT $10
),
outgoing_page AS (
	SELECT 'outgoing'::text AS direction, id, title, mtime, mutual
	FROM outgoing_links
	WHERE $7::boolean
	  AND (
		$8::bigint IS NULL
		OR mtime < $8
		OR (mtime = $8 AND id < $9)
	  )
	ORDER BY mtime DESC, id DESC
	LIMIT $10
),
page AS (
	SELECT * FROM incoming_page
	UNION ALL
	SELECT * FROM outgoing_page
)
SELECT
	counts.current_exists,
	counts.incoming_count,
	counts.outgoing_count,
	counts.unique_count,
	page.direction,
	page.id,
	page.title,
	page.mtime,
	page.mutual
FROM counts
LEFT JOIN page ON TRUE
ORDER BY
	CASE page.direction WHEN 'incoming' THEN 0 WHEN 'outgoing' THEN 1 ELSE 2 END,
	page.mtime DESC,
	page.id DESC
`

func linkCursorArgs(cursor *model.DocumentLinkCursor) (any, string) {
	if cursor == nil {
		return nil, ""
	}
	return cursor.Mtime, cursor.ID
}

func finishDocumentLinkPage(page *model.DocumentLinkPage, limit int) {
	if page == nil {
		return
	}
	if len(page.Items) > limit {
		page.HasMore = true
		page.Items = page.Items[:limit]
	}
}

func newDocumentLinksResult(
	query model.DocumentLinksQuery,
) *model.DocumentLinksResult {
	result := &model.DocumentLinksResult{}
	if query.IncludeIncoming {
		result.Incoming = &model.DocumentLinkPage{
			Items: make([]model.LinkedDocument, 0, query.Limit),
		}
	}
	if query.IncludeOutgoing {
		result.Outgoing = &model.DocumentLinkPage{
			Items: make([]model.LinkedDocument, 0, query.Limit),
		}
	}
	return result
}

func appendDocumentLinkRow(
	result *model.DocumentLinksResult,
	direction string,
	item model.LinkedDocument,
) error {
	switch direction {
	case "incoming":
		if result.Incoming == nil {
			return fmt.Errorf(
				"%w: %s",
				errUnexpectedDocumentLinkDirection,
				direction,
			)
		}
		result.Incoming.Items = append(result.Incoming.Items, item)
	case "outgoing":
		if result.Outgoing == nil {
			return fmt.Errorf(
				"%w: %s",
				errUnexpectedDocumentLinkDirection,
				direction,
			)
		}
		result.Outgoing.Items = append(result.Outgoing.Items, item)
	default:
		return fmt.Errorf(
			"%w: %s",
			errUnexpectedDocumentLinkDirection,
			direction,
		)
	}
	return nil
}

func scanDocumentLinkRows(
	rows *sql.Rows,
	result *model.DocumentLinksResult,
) (bool, bool, error) {
	currentExists := false
	sawSummary := false
	for rows.Next() {
		var (
			direction sql.NullString
			id        sql.NullString
			title     sql.NullString
			mtime     sql.NullInt64
			mutual    sql.NullBool
		)
		if err := rows.Scan(
			&currentExists,
			&result.Counts.Incoming,
			&result.Counts.Outgoing,
			&result.Counts.Unique,
			&direction,
			&id,
			&title,
			&mtime,
			&mutual,
		); err != nil {
			return false, false, fmt.Errorf("scan document links: %w", err)
		}
		sawSummary = true
		if !direction.Valid {
			continue
		}
		err := appendDocumentLinkRow(
			result,
			direction.String,
			model.LinkedDocument{
				ID:     id.String,
				Title:  title.String,
				Mtime:  mtime.Int64,
				Mutual: mutual.Bool,
			},
		)
		if err != nil {
			return false, false, fmt.Errorf("scan document links: %w", err)
		}
	}
	if err := rows.Err(); err != nil {
		return false, false, fmt.Errorf("iterate document links: %w", err)
	}
	return currentExists, sawSummary, nil
}

func (r *DocumentRepo) ListLinks(
	ctx context.Context,
	userID string,
	documentID string,
	query model.DocumentLinksQuery,
) (*model.DocumentLinksResult, error) {
	incomingMtime, incomingID := linkCursorArgs(query.IncomingCursor)
	outgoingMtime, outgoingID := linkCursorArgs(query.OutgoingCursor)
	rows, err := conn(ctx, r.db).QueryContext(
		ctx,
		listDocumentLinksQuery,
		documentID,
		userID,
		DocumentStateNormal,
		query.IncludeIncoming,
		incomingMtime,
		incomingID,
		query.IncludeOutgoing,
		outgoingMtime,
		outgoingID,
		query.Limit+1,
	)
	if err != nil {
		return nil, fmt.Errorf("query document links: %w", err)
	}
	defer func() { _ = rows.Close() }()

	result := newDocumentLinksResult(query)
	currentExists, sawSummary, err := scanDocumentLinkRows(rows, result)
	if err != nil {
		return nil, err
	}
	if !sawSummary || !currentExists {
		return nil, appErr.ErrNotFound
	}

	finishDocumentLinkPage(result.Incoming, query.Limit)
	finishDocumentLinkPage(result.Outgoing, query.Limit)
	return result, nil
}
