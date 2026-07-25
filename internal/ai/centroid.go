package ai

import (
	"fmt"
	"math"

	"github.com/xxxsen/mnote/internal/model"
)

func ComputeCentroid(
	chunks []model.ChunkEmbeddingV2,
	dimensions int,
) ([]float32, error) {
	if len(chunks) == 0 {
		return nil, nil
	}
	accumulator := make([]float64, dimensions)
	totalWeight := float64(0)
	for _, chunk := range chunks {
		if len(chunk.Embedding) != dimensions {
			return nil, &ProviderError{
				Code: ErrorInvalidResponse,
				Message: fmt.Sprintf(
					"centroid input dimension %d; expected %d",
					len(chunk.Embedding),
					dimensions,
				),
			}
		}
		weight := chunkWeight(chunk.ChunkType)
		totalWeight += weight
		for index, value := range chunk.Embedding {
			if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
				return nil, &ProviderError{
					Code:    ErrorInvalidResponse,
					Message: "centroid input contains non-finite values",
				}
			}
			accumulator[index] += float64(value) * weight
		}
	}
	if totalWeight == 0 {
		return nil, &ProviderError{
			Code:    ErrorInvalidResponse,
			Message: "centroid has no weighted inputs",
		}
	}
	normSquared := float64(0)
	for index := range accumulator {
		accumulator[index] /= totalWeight
		normSquared += accumulator[index] * accumulator[index]
	}
	if normSquared == 0 || math.IsNaN(normSquared) || math.IsInf(normSquared, 0) {
		return nil, &ProviderError{
			Code:    ErrorInvalidResponse,
			Message: "centroid cannot be normalized",
		}
	}
	norm := math.Sqrt(normSquared)
	result := make([]float32, dimensions)
	for index := range accumulator {
		value := accumulator[index] / norm
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, &ProviderError{
				Code:    ErrorInvalidResponse,
				Message: "normalized centroid is not finite",
			}
		}
		result[index] = float32(value)
	}
	return result, nil
}

func chunkWeight(chunkType model.ChunkType) float64 {
	switch chunkType {
	case model.ChunkTypeTitle:
		return 1.2
	case model.ChunkTypeText:
		return 1
	case model.ChunkTypeMixed:
		return 0.9
	case model.ChunkTypeCode:
		return 0.7
	default:
		return 0.7
	}
}
