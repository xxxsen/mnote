package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestEmbeddingMetricsHandler(t *testing.T) {
	SetEmbeddingJobs("profile", "pending", 2)
	SetEmbeddingOldestReady("profile", 15)
	SetEmbeddingCoverage("generation", 0.75)
	ObserveEmbeddingJob("profile", 2*time.Second)
	ObserveEmbeddingProvider("provider", "success", time.Second)
	SetEmbeddingProviderCooldown("provider", 30)
	ObserveEmbeddingCache("database", "hit")
	ObserveInvalidVector("dimension")
	ObserveSemanticSearch("v2_precise", 500*time.Millisecond, 3)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	Handler().ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(
		t,
		"text/plain; version=0.0.4",
		recorder.Header().Get("Content-Type"),
	)
	body := recorder.Body.String()
	for _, metric := range []string{
		`embedding_jobs{profile="profile",status="pending"} 2`,
		`embedding_job_oldest_ready_seconds{profile="profile"} 15`,
		`embedding_index_coverage_ratio{generation="generation"} 0.75`,
		`embedding_job_duration_seconds_count{profile="profile"} 1`,
		`embedding_provider_requests_total{provider="provider",result="success"} 1`,
		`embedding_provider_latency_seconds_count{provider="provider"} 1`,
		`embedding_provider_cooldown_seconds{provider="provider"} 30`,
		`embedding_cache_requests_total{layer="database",result="hit"} 1`,
		`embedding_invalid_vectors_total{reason="dimension"} 1`,
		`semantic_search_duration_seconds_count{path="v2_precise"} 1`,
		`semantic_search_candidates_total 3`,
	} {
		assert.True(t, strings.Contains(body, metric), metric)
	}
	assert.NotContains(t, body, "document_id")
	assert.NotContains(t, body, "user_id")
	assert.NotContains(t, body, "query")
}
