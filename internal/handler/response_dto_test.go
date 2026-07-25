package handler

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/service"
)

func responseMap(t *testing.T, value any) map[string]any {
	t.Helper()
	data, err := json.Marshal(value)
	require.NoError(t, err)
	var result map[string]any
	require.NoError(t, json.Unmarshal(data, &result))
	return result
}

func TestResponseDTOsDoNotExposePersistenceOnlyFields(t *testing.T) {
	user := responseMap(t, toUserResponse(&model.User{
		ID:              "u1",
		Email:           "User@example.test",
		EmailNormalized: "user@example.test",
		PasswordHash:    "secret-hash",
	}))
	assert.Equal(t, "u1", user["id"])
	assert.NotContains(t, user, "email_normalized")
	assert.NotContains(t, user, "password_hash")

	share := responseMap(t, toShareResponse(&model.Share{
		ID: "s1", PasswordHash: "secret-hash",
	}))
	assert.Equal(t, "s1", share["id"])
	assert.NotContains(t, share, "password_hash")

	assets := toAssetListResponses([]service.AssetListItem{{
		Asset: model.Asset{
			ID: "a1", Status: model.AssetStatusFailed,
			LastError: "provider details", LockedUntil: 123,
		},
	}})
	require.Len(t, assets, 1)
	asset := responseMap(t, assets[0])
	assert.Equal(t, "a1", asset["id"])
	assert.NotContains(t, asset, "status")
	assert.NotContains(t, asset, "last_error")
	assert.NotContains(t, asset, "locked_until")
}

func TestDocumentResponseKeepsEditorConcurrencyContract(t *testing.T) {
	item := responseMap(t, toDocumentResponse(model.Document{
		ID: "d1", ContentHash: "hash", ContentMtime: 12, ContentRevision: 3,
	}))
	assert.Equal(t, "d1", item["id"])
	assert.Equal(t, "hash", item["content_hash"])
	assert.Equal(t, float64(12), item["content_mtime"])
	assert.Equal(t, float64(3), item["content_revision"])
	assert.NotContains(t, item, "summary")
}
