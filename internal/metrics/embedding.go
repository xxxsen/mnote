package metrics

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

type histogramValue struct {
	count uint64
	sum   float64
}

type embeddingRegistry struct {
	mu sync.RWMutex

	jobs             map[string]float64
	oldestReady      map[string]float64
	coverage         map[string]float64
	jobDuration      map[string]histogramValue
	providerRequests map[string]uint64
	providerLatency  map[string]histogramValue
	providerCooldown map[string]float64
	cacheRequests    map[string]uint64
	invalidVectors   map[string]uint64
	searchDuration   map[string]histogramValue
	searchCandidates uint64
}

var embedding = &embeddingRegistry{
	jobs:             make(map[string]float64),
	oldestReady:      make(map[string]float64),
	coverage:         make(map[string]float64),
	jobDuration:      make(map[string]histogramValue),
	providerRequests: make(map[string]uint64),
	providerLatency:  make(map[string]histogramValue),
	providerCooldown: make(map[string]float64),
	cacheRequests:    make(map[string]uint64),
	invalidVectors:   make(map[string]uint64),
	searchDuration:   make(map[string]histogramValue),
}

func SetEmbeddingJobs(profile, status string, value float64) {
	embedding.mu.Lock()
	embedding.jobs[pair(profile, status)] = value
	embedding.mu.Unlock()
}

func SetEmbeddingOldestReady(profile string, value float64) {
	embedding.mu.Lock()
	embedding.oldestReady[profile] = value
	embedding.mu.Unlock()
}

func SetEmbeddingCoverage(generation string, value float64) {
	embedding.mu.Lock()
	embedding.coverage[generation] = value
	embedding.mu.Unlock()
}

func ObserveEmbeddingJob(profile string, duration time.Duration) {
	embedding.mu.Lock()
	value := embedding.jobDuration[profile]
	value.count++
	value.sum += duration.Seconds()
	embedding.jobDuration[profile] = value
	embedding.mu.Unlock()
}

func ObserveEmbeddingProvider(provider, result string, duration time.Duration) {
	embedding.mu.Lock()
	key := pair(provider, result)
	embedding.providerRequests[key]++
	latency := embedding.providerLatency[provider]
	latency.count++
	latency.sum += duration.Seconds()
	embedding.providerLatency[provider] = latency
	embedding.mu.Unlock()
}

func SetEmbeddingProviderCooldown(provider string, seconds float64) {
	embedding.mu.Lock()
	embedding.providerCooldown[provider] = seconds
	embedding.mu.Unlock()
}

// ResetEmbeddingMaintenanceGauges removes labels that are no longer present
// in the database snapshot (for example, after a Generation is retired).
// Counters and histograms are intentionally cumulative and are not reset.
func ResetEmbeddingMaintenanceGauges() {
	embedding.mu.Lock()
	clear(embedding.jobs)
	clear(embedding.oldestReady)
	clear(embedding.coverage)
	clear(embedding.providerCooldown)
	embedding.mu.Unlock()
}

func ObserveEmbeddingCache(layer, result string) {
	embedding.mu.Lock()
	embedding.cacheRequests[pair(layer, result)]++
	embedding.mu.Unlock()
}

func ObserveInvalidVector(reason string) {
	embedding.mu.Lock()
	embedding.invalidVectors[reason]++
	embedding.mu.Unlock()
}

func ObserveSemanticSearch(path string, duration time.Duration, candidates int) {
	embedding.mu.Lock()
	value := embedding.searchDuration[path]
	value.count++
	value.sum += duration.Seconds()
	embedding.searchDuration[path] = value
	if candidates > 0 {
		embedding.searchCandidates += uint64(candidates)
	}
	embedding.mu.Unlock()
}

func Handler() http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4")
		embedding.writePrometheus(writer)
	})
}

func (registry *embeddingRegistry) writePrometheus(writer http.ResponseWriter) {
	registry.mu.RLock()
	defer registry.mu.RUnlock()
	writePairGauge(writer, "embedding_jobs", "profile", "status", registry.jobs)
	writeSingleGauge(
		writer,
		"embedding_job_oldest_ready_seconds",
		"profile",
		registry.oldestReady,
	)
	writeSingleGauge(
		writer,
		"embedding_index_coverage_ratio",
		"generation",
		registry.coverage,
	)
	writeHistogram(writer, "embedding_job_duration_seconds", "profile", registry.jobDuration)
	writePairCounter(
		writer,
		"embedding_provider_requests_total",
		"provider",
		"result",
		registry.providerRequests,
	)
	writeHistogram(
		writer,
		"embedding_provider_latency_seconds",
		"provider",
		registry.providerLatency,
	)
	writeSingleGauge(
		writer,
		"embedding_provider_cooldown_seconds",
		"provider",
		registry.providerCooldown,
	)
	writePairCounter(
		writer,
		"embedding_cache_requests_total",
		"layer",
		"result",
		registry.cacheRequests,
	)
	writeSingleCounter(
		writer,
		"embedding_invalid_vectors_total",
		"reason",
		registry.invalidVectors,
	)
	writeHistogram(
		writer,
		"semantic_search_duration_seconds",
		"path",
		registry.searchDuration,
	)
	_, _ = fmt.Fprintf(
		writer,
		"semantic_search_candidates_total %d\n",
		registry.searchCandidates,
	)
}

func pair(left, right string) string {
	return left + "\x00" + right
}

func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func escapeLabel(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	return strings.ReplaceAll(value, `"`, `\"`)
}

func writePairGauge(
	writer http.ResponseWriter,
	name, leftLabel, rightLabel string,
	values map[string]float64,
) {
	for _, key := range sortedKeys(values) {
		parts := strings.SplitN(key, "\x00", 2)
		_, _ = fmt.Fprintf(
			writer,
			"%s{%s=\"%s\",%s=\"%s\"} %g\n",
			name,
			leftLabel,
			escapeLabel(parts[0]),
			rightLabel,
			escapeLabel(parts[1]),
			values[key],
		)
	}
}

func writeSingleGauge(
	writer http.ResponseWriter,
	name, label string,
	values map[string]float64,
) {
	for _, key := range sortedKeys(values) {
		_, _ = fmt.Fprintf(
			writer,
			"%s{%s=\"%s\"} %g\n",
			name,
			label,
			escapeLabel(key),
			values[key],
		)
	}
}

func writePairCounter(
	writer http.ResponseWriter,
	name, leftLabel, rightLabel string,
	values map[string]uint64,
) {
	for _, key := range sortedKeys(values) {
		parts := strings.SplitN(key, "\x00", 2)
		_, _ = fmt.Fprintf(
			writer,
			"%s{%s=\"%s\",%s=\"%s\"} %d\n",
			name,
			leftLabel,
			escapeLabel(parts[0]),
			rightLabel,
			escapeLabel(parts[1]),
			values[key],
		)
	}
}

func writeSingleCounter(
	writer http.ResponseWriter,
	name, label string,
	values map[string]uint64,
) {
	for _, key := range sortedKeys(values) {
		_, _ = fmt.Fprintf(
			writer,
			"%s{%s=\"%s\"} %d\n",
			name,
			label,
			escapeLabel(key),
			values[key],
		)
	}
}

func writeHistogram(
	writer http.ResponseWriter,
	name, label string,
	values map[string]histogramValue,
) {
	for _, key := range sortedKeys(values) {
		value := values[key]
		_, _ = fmt.Fprintf(
			writer,
			"%s_count{%s=\"%s\"} %d\n",
			name,
			label,
			escapeLabel(key),
			value.count,
		)
		_, _ = fmt.Fprintf(
			writer,
			"%s_sum{%s=\"%s\"} %g\n",
			name,
			label,
			escapeLabel(key),
			value.sum,
		)
	}
}
