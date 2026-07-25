package ai

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestComputeCentroid_WeightedAndNormalized(t *testing.T) {
	result, err := ComputeCentroid([]model.ChunkEmbeddingV2{
		{ChunkType: model.ChunkTypeTitle, Embedding: []float32{1, 0}},
		{ChunkType: model.ChunkTypeCode, Embedding: []float32{0, 1}},
	}, 2)
	require.NoError(t, err)
	require.Len(t, result, 2)
	norm := math.Sqrt(float64(result[0]*result[0] + result[1]*result[1]))
	assert.InDelta(t, 1, norm, 0.00001)
	assert.Greater(t, result[0], result[1])
}

func TestComputeCentroid_EmptyAndInvalid(t *testing.T) {
	result, err := ComputeCentroid(nil, 384)
	require.NoError(t, err)
	assert.Nil(t, result)

	_, err = ComputeCentroid([]model.ChunkEmbeddingV2{{
		ChunkType: model.ChunkTypeText,
		Embedding: []float32{1},
	}}, 2)
	assert.Error(t, err)

	_, err = ComputeCentroid([]model.ChunkEmbeddingV2{{
		ChunkType: model.ChunkTypeText,
		Embedding: []float32{float32(math.NaN()), 1},
	}}, 2)
	assert.Error(t, err)

	_, err = ComputeCentroid([]model.ChunkEmbeddingV2{{
		ChunkType: model.ChunkTypeText,
		Embedding: []float32{0, 0},
	}}, 2)
	assert.Error(t, err)
}
