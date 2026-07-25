package repo

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

var documentLinkColumns = []string{
	"current_exists",
	"incoming_count",
	"outgoing_count",
	"unique_count",
	"direction",
	"id",
	"title",
	"mtime",
	"mutual",
}

func TestDocumentRepoListLinks(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	rows := sqlmock.NewRows(documentLinkColumns).
		AddRow(true, 3, 2, 4, "incoming", "i3", "Incoming 3", int64(300), false).
		AddRow(true, 3, 2, 4, "incoming", "i2", "Incoming 2", int64(200), true).
		AddRow(true, 3, 2, 4, "incoming", "i1", "Incoming 1", int64(100), false).
		AddRow(true, 3, 2, 4, "outgoing", "o2", "Outgoing 2", int64(200), true).
		AddRow(true, 3, 2, 4, "outgoing", "o1", "Outgoing 1", int64(100), false)
	mock.ExpectQuery("(?s)WITH current_document").
		WithArgs("d1", "u1", 1, true, nil, "", true, int64(400), "o4", 3).
		WillReturnRows(rows)

	result, err := NewDocumentRepo(db).ListLinks(
		context.Background(),
		"u1",
		"d1",
		model.DocumentLinksQuery{
			IncludeIncoming: true,
			IncludeOutgoing: true,
			OutgoingCursor:  &model.DocumentLinkCursor{Mtime: 400, ID: "o4"},
			Limit:           2,
		},
	)
	require.NoError(t, err)
	assert.Equal(t, model.DocumentLinkCounts{
		Incoming: 3, Outgoing: 2, Unique: 4,
	}, result.Counts)
	require.NotNil(t, result.Incoming)
	assert.Len(t, result.Incoming.Items, 2)
	assert.True(t, result.Incoming.HasMore)
	assert.True(t, result.Incoming.Items[1].Mutual)
	require.NotNil(t, result.Outgoing)
	assert.Len(t, result.Outgoing.Items, 2)
	assert.False(t, result.Outgoing.HasMore)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDocumentRepoListLinksEmptyAndSingleDirection(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	rows := sqlmock.NewRows(documentLinkColumns).
		AddRow(true, 0, 0, 0, nil, nil, nil, nil, nil)
	mock.ExpectQuery("(?s)WITH current_document").
		WithArgs("d1", "u1", 1, true, nil, "", false, nil, "", 21).
		WillReturnRows(rows)

	result, err := NewDocumentRepo(db).ListLinks(
		context.Background(),
		"u1",
		"d1",
		model.DocumentLinksQuery{IncludeIncoming: true, Limit: 20},
	)
	require.NoError(t, err)
	require.NotNil(t, result.Incoming)
	assert.NotNil(t, result.Incoming.Items)
	assert.Empty(t, result.Incoming.Items)
	assert.Nil(t, result.Outgoing)
}

func TestDocumentRepoListLinksNotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	rows := sqlmock.NewRows(documentLinkColumns).
		AddRow(false, 0, 0, 0, nil, nil, nil, nil, nil)
	mock.ExpectQuery("(?s)WITH current_document").WillReturnRows(rows)

	_, err = NewDocumentRepo(db).ListLinks(
		context.Background(),
		"u1",
		"missing",
		model.DocumentLinksQuery{IncludeIncoming: true, Limit: 20},
	)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepoListLinksFailures(t *testing.T) {
	t.Run("query", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()
		expected := errors.New("query failed")
		mock.ExpectQuery("(?s)WITH current_document").WillReturnError(expected)
		_, err = NewDocumentRepo(db).ListLinks(
			context.Background(),
			"u1",
			"d1",
			model.DocumentLinksQuery{IncludeIncoming: true, Limit: 20},
		)
		assert.ErrorIs(t, err, expected)
	})

	t.Run("scan", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()
		rows := sqlmock.NewRows([]string{"current_exists"}).AddRow(true)
		mock.ExpectQuery("(?s)WITH current_document").WillReturnRows(rows)
		_, err = NewDocumentRepo(db).ListLinks(
			context.Background(),
			"u1",
			"d1",
			model.DocumentLinksQuery{IncludeIncoming: true, Limit: 20},
		)
		assert.Error(t, err)
	})

	t.Run("rows", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()
		expected := errors.New("rows failed")
		rows := sqlmock.NewRows(documentLinkColumns).
			AddRow(true, 1, 0, 1, "incoming", "d2", "Two", int64(2), false).
			RowError(0, expected)
		mock.ExpectQuery("(?s)WITH current_document").WillReturnRows(rows)
		_, err = NewDocumentRepo(db).ListLinks(
			context.Background(),
			"u1",
			"d1",
			model.DocumentLinksQuery{IncludeIncoming: true, Limit: 20},
		)
		assert.ErrorIs(t, err, expected)
	})

	t.Run("unknown direction", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()
		rows := sqlmock.NewRows(documentLinkColumns).
			AddRow(true, 1, 0, 1, "sideways", "d2", "Two", int64(2), false)
		mock.ExpectQuery("(?s)WITH current_document").WillReturnRows(rows)
		_, err = NewDocumentRepo(db).ListLinks(
			context.Background(),
			"u1",
			"d1",
			model.DocumentLinksQuery{IncludeIncoming: true, Limit: 20},
		)
		assert.Error(t, err)
	})
}
