package service

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func mustDocumentLinkCursor(t *testing.T, mtime int64, id string) string {
	t.Helper()
	value, err := encodeDocumentLinkCursor(model.LinkedDocument{
		ID: id, Mtime: mtime,
	})
	require.NoError(t, err)
	return value
}

func TestParseDocumentLinkDirections(t *testing.T) {
	tests := []struct {
		name             string
		value            string
		incoming         bool
		outgoing         bool
		expectInvalidErr bool
	}{
		{name: "default", incoming: true, outgoing: true},
		{name: "incoming", value: "incoming", incoming: true},
		{name: "outgoing", value: "outgoing", outgoing: true},
		{name: "both with duplicates", value: " outgoing, incoming,outgoing ", incoming: true, outgoing: true},
		{name: "unknown", value: "related", expectInvalidErr: true},
		{name: "empty part", value: "incoming,", expectInvalidErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			incoming, outgoing, err := parseDocumentLinkDirections(tt.value)
			if tt.expectInvalidErr {
				assert.ErrorIs(t, err, appErr.ErrInvalid)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.incoming, incoming)
			assert.Equal(t, tt.outgoing, outgoing)
		})
	}
}

func TestDocumentLinkCursor(t *testing.T) {
	valid := mustDocumentLinkCursor(t, 123, "doc-1")
	cursor, present, err := decodeDocumentLinkCursor(valid)
	require.NoError(t, err)
	assert.True(t, present)
	assert.Equal(t, model.DocumentLinkCursor{Mtime: 123, ID: "doc-1"}, cursor)

	tests := []string{
		strings.Repeat("x", maxDocumentLinkCursorSize+1),
		"not-base64!",
		base64.RawURLEncoding.EncodeToString([]byte(`{"v":2,"mtime":1,"id":"d"}`)),
		base64.RawURLEncoding.EncodeToString([]byte(`{"v":1,"mtime":0,"id":"d"}`)),
		base64.RawURLEncoding.EncodeToString([]byte(`{"v":1,"mtime":1,"id":""}`)),
		base64.RawURLEncoding.EncodeToString([]byte(`{"v":1,"mtime":1,"id":"d","extra":true}`)),
		base64.RawURLEncoding.EncodeToString([]byte(`{"v":1,"mtime":1,"id":"d"} {}`)),
	}
	for _, value := range tests {
		_, _, err := decodeDocumentLinkCursor(value)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	}

	empty, present, err := decodeDocumentLinkCursor("")
	require.NoError(t, err)
	assert.False(t, present)
	assert.Zero(t, empty)
}

func TestDocumentServiceListLinks(t *testing.T) {
	incomingCursor := mustDocumentLinkCursor(t, 200, "incoming-cursor")
	outgoingCursor := mustDocumentLinkCursor(t, 100, "outgoing-cursor")
	docs := &mockDocumentRepo{
		listLinksFn: func(
			_ context.Context,
			userID string,
			documentID string,
			query model.DocumentLinksQuery,
		) (*model.DocumentLinksResult, error) {
			assert.Equal(t, "u1", userID)
			assert.Equal(t, "d1", documentID)
			assert.True(t, query.IncludeIncoming)
			assert.True(t, query.IncludeOutgoing)
			assert.Equal(t, 20, query.Limit)
			assert.Equal(t, &model.DocumentLinkCursor{
				Mtime: 200, ID: "incoming-cursor",
			}, query.IncomingCursor)
			assert.Equal(t, &model.DocumentLinkCursor{
				Mtime: 100, ID: "outgoing-cursor",
			}, query.OutgoingCursor)
			return &model.DocumentLinksResult{
				Counts: model.DocumentLinkCounts{Incoming: 2, Outgoing: 1, Unique: 2},
				Incoming: &model.DocumentLinkPage{
					Items: []model.LinkedDocument{
						{ID: "d2", Title: "Two", Mtime: 90, Mutual: true},
						{ID: "d3", Title: "Three", Mtime: 80},
					},
					HasMore: true,
				},
				Outgoing: &model.DocumentLinkPage{
					Items: make([]model.LinkedDocument, 0),
				},
			}, nil
		},
	}
	result, err := newDocSvc(docs, nil, nil, nil).ListLinks(
		context.Background(),
		"u1",
		"d1",
		DocumentLinksInput{
			Limit:          20,
			IncomingCursor: incomingCursor,
			OutgoingCursor: outgoingCursor,
		},
	)
	require.NoError(t, err)
	require.NotNil(t, result.Incoming)
	require.NotEmpty(t, result.Incoming.NextCursor)
	decoded, present, err := decodeDocumentLinkCursor(
		result.Incoming.NextCursor,
	)
	require.NoError(t, err)
	assert.True(t, present)
	assert.Equal(t, model.DocumentLinkCursor{Mtime: 80, ID: "d3"}, decoded)
	require.NotNil(t, result.Outgoing)
	assert.NotNil(t, result.Outgoing.Items)
	assert.Empty(t, result.Outgoing.NextCursor)
}

func TestDocumentServiceListLinksSingleDirection(t *testing.T) {
	docs := &mockDocumentRepo{
		listLinksFn: func(
			_ context.Context,
			_ string,
			_ string,
			query model.DocumentLinksQuery,
		) (*model.DocumentLinksResult, error) {
			assert.True(t, query.IncludeIncoming)
			assert.False(t, query.IncludeOutgoing)
			return &model.DocumentLinksResult{
				Incoming: &model.DocumentLinkPage{
					Items: make([]model.LinkedDocument, 0),
				},
			}, nil
		},
	}
	result, err := newDocSvc(docs, nil, nil, nil).ListLinks(
		context.Background(),
		"u1",
		"d1",
		DocumentLinksInput{Include: "incoming", Limit: 1},
	)
	require.NoError(t, err)
	require.NotNil(t, result.Incoming)
	assert.Nil(t, result.Outgoing)
}

func TestDocumentServiceListLinksValidation(t *testing.T) {
	validCursor := mustDocumentLinkCursor(t, 1, "d")
	tests := []DocumentLinksInput{
		{Limit: 0},
		{Limit: MaxDocumentLinksLimit + 1},
		{Limit: 1, Include: "unknown"},
		{Limit: 1, Include: "incoming", OutgoingCursor: validCursor},
		{Limit: 1, Include: "outgoing", IncomingCursor: validCursor},
		{Limit: 1, IncomingCursor: "invalid"},
	}
	for _, input := range tests {
		_, err := newDocSvc(&mockDocumentRepo{}, nil, nil, nil).ListLinks(
			context.Background(), "u1", "d1", input,
		)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	}
	_, err := newDocSvc(&mockDocumentRepo{}, nil, nil, nil).ListLinks(
		context.Background(), "", "d1", DocumentLinksInput{Limit: 1},
	)
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestDocumentServiceListLinksRepositoryFailures(t *testing.T) {
	expected := errors.New("database unavailable")
	docs := &mockDocumentRepo{
		listLinksFn: func(
			context.Context, string, string, model.DocumentLinksQuery,
		) (*model.DocumentLinksResult, error) {
			return nil, expected
		},
	}
	_, err := newDocSvc(docs, nil, nil, nil).ListLinks(
		context.Background(), "u1", "d1", DocumentLinksInput{Limit: 20},
	)
	assert.ErrorIs(t, err, expected)

	for _, result := range []*model.DocumentLinksResult{
		nil,
		{Incoming: nil, Outgoing: &model.DocumentLinkPage{}},
		{
			Incoming: &model.DocumentLinkPage{HasMore: true},
			Outgoing: &model.DocumentLinkPage{},
		},
	} {
		docs.listLinksFn = func(
			context.Context, string, string, model.DocumentLinksQuery,
		) (*model.DocumentLinksResult, error) {
			return result, nil
		}
		_, err := newDocSvc(docs, nil, nil, nil).ListLinks(
			context.Background(), "u1", "d1", DocumentLinksInput{Limit: 20},
		)
		assert.Error(t, err)
		assert.NotErrorIs(t, err, appErr.ErrInvalid)
	}
}
