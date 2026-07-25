package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

const (
	DefaultDocumentLinksLimit = 20
	MaxDocumentLinksLimit     = 50
	maxDocumentLinkCursorSize = 512
	documentLinkCursorVersion = 1
)

var (
	errMissingDocumentLinkPage = errors.New(
		"included document link page is missing",
	)
	errInvalidDocumentLinkPage = errors.New(
		"document link page reports more rows without an item",
	)
	errEmptyDocumentLinksResult = errors.New(
		"document links repository returned an empty result",
	)
)

type DocumentLinksInput struct {
	Include        string
	Limit          int
	IncomingCursor string
	OutgoingCursor string
}

type documentLinkCursorPayload struct {
	Version int    `json:"v"`
	Mtime   int64  `json:"mtime"`
	ID      string `json:"id"`
}

func parseDocumentLinkDirections(value string) (bool, bool, error) {
	if value == "" {
		return true, true, nil
	}
	var incoming, outgoing bool
	for _, raw := range strings.Split(value, ",") {
		switch strings.TrimSpace(raw) {
		case "incoming":
			incoming = true
		case "outgoing":
			outgoing = true
		default:
			return false, false, appErr.ErrInvalid
		}
	}
	if !incoming && !outgoing {
		return false, false, appErr.ErrInvalid
	}
	return incoming, outgoing, nil
}

func decodeDocumentLinkCursor(
	value string,
) (model.DocumentLinkCursor, bool, error) {
	if value == "" {
		return model.DocumentLinkCursor{}, false, nil
	}
	if len(value) > maxDocumentLinkCursorSize {
		return model.DocumentLinkCursor{}, false, appErr.ErrInvalid
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return model.DocumentLinkCursor{}, false, appErr.ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(decoded))
	decoder.DisallowUnknownFields()
	var payload documentLinkCursorPayload
	if err := decoder.Decode(&payload); err != nil {
		return model.DocumentLinkCursor{}, false, appErr.ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return model.DocumentLinkCursor{}, false, appErr.ErrInvalid
	}
	if payload.Version != documentLinkCursorVersion ||
		payload.Mtime <= 0 ||
		strings.TrimSpace(payload.ID) == "" {
		return model.DocumentLinkCursor{}, false, appErr.ErrInvalid
	}
	return model.DocumentLinkCursor{
		Mtime: payload.Mtime,
		ID:    payload.ID,
	}, true, nil
}

func encodeDocumentLinkCursor(item model.LinkedDocument) (string, error) {
	payload, err := json.Marshal(documentLinkCursorPayload{
		Version: documentLinkCursorVersion,
		Mtime:   item.Mtime,
		ID:      item.ID,
	})
	if err != nil {
		return "", fmt.Errorf("marshal document link cursor: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func finishDocumentLinksServicePage(page *model.DocumentLinkPage) error {
	if page == nil {
		return errMissingDocumentLinkPage
	}
	if page.Items == nil {
		page.Items = make([]model.LinkedDocument, 0)
	}
	page.NextCursor = ""
	if !page.HasMore {
		return nil
	}
	if len(page.Items) == 0 {
		return errInvalidDocumentLinkPage
	}
	cursor, err := encodeDocumentLinkCursor(page.Items[len(page.Items)-1])
	if err != nil {
		return err
	}
	page.NextCursor = cursor
	return nil
}

func buildDocumentLinksQuery(
	input DocumentLinksInput,
) (model.DocumentLinksQuery, error) {
	if input.Limit < 1 || input.Limit > MaxDocumentLinksLimit {
		return model.DocumentLinksQuery{}, appErr.ErrInvalid
	}
	includeIncoming, includeOutgoing, err := parseDocumentLinkDirections(
		input.Include,
	)
	if err != nil {
		return model.DocumentLinksQuery{}, err
	}
	if (!includeIncoming && input.IncomingCursor != "") ||
		(!includeOutgoing && input.OutgoingCursor != "") {
		return model.DocumentLinksQuery{}, appErr.ErrInvalid
	}
	incomingCursor, hasIncomingCursor, err := decodeDocumentLinkCursor(
		input.IncomingCursor,
	)
	if err != nil {
		return model.DocumentLinksQuery{}, err
	}
	outgoingCursor, hasOutgoingCursor, err := decodeDocumentLinkCursor(
		input.OutgoingCursor,
	)
	if err != nil {
		return model.DocumentLinksQuery{}, err
	}
	query := model.DocumentLinksQuery{
		IncludeIncoming: includeIncoming,
		IncludeOutgoing: includeOutgoing,
		Limit:           input.Limit,
	}
	if hasIncomingCursor {
		query.IncomingCursor = &incomingCursor
	}
	if hasOutgoingCursor {
		query.OutgoingCursor = &outgoingCursor
	}
	return query, nil
}

func finishDocumentLinksResult(
	result *model.DocumentLinksResult,
	includeIncoming bool,
	includeOutgoing bool,
) error {
	if includeIncoming {
		if err := finishDocumentLinksServicePage(result.Incoming); err != nil {
			return fmt.Errorf("finish incoming document links: %w", err)
		}
	} else {
		result.Incoming = nil
	}
	if includeOutgoing {
		if err := finishDocumentLinksServicePage(result.Outgoing); err != nil {
			return fmt.Errorf("finish outgoing document links: %w", err)
		}
	} else {
		result.Outgoing = nil
	}
	return nil
}

func (s *DocumentService) ListLinks(
	ctx context.Context,
	userID string,
	documentID string,
	input DocumentLinksInput,
) (*model.DocumentLinksResult, error) {
	if userID == "" || documentID == "" {
		return nil, appErr.ErrInvalid
	}
	query, err := buildDocumentLinksQuery(input)
	if err != nil {
		return nil, err
	}
	result, err := s.docs.ListLinks(ctx, userID, documentID, query)
	if err != nil {
		return nil, fmt.Errorf("list document links: %w", err)
	}
	if result == nil {
		return nil, fmt.Errorf("list document links: %w", errEmptyDocumentLinksResult)
	}
	if err := finishDocumentLinksResult(
		result,
		query.IncludeIncoming,
		query.IncludeOutgoing,
	); err != nil {
		return nil, err
	}
	return result, nil
}
