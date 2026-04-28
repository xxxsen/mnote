package job

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockEmbeddingProcessor struct {
	err       error
	callCount int
}

func (m *mockEmbeddingProcessor) ProcessPendingEmbeddings(
	_ context.Context, _ int64,
) error {
	m.callCount++
	return m.err
}

type mockSummaryProcessor struct {
	err       error
	callCount int
}

func (m *mockSummaryProcessor) ProcessPendingSummaries(
	_ context.Context, _ int64,
) error {
	m.callCount++
	return m.err
}

type mockExpiryCleaner struct {
	deleted   int64
	err       error
	callCount int
}

func (m *mockExpiryCleaner) DeleteBefore(
	_ context.Context, _ int64,
) (int64, error) {
	m.callCount++
	return m.deleted, m.err
}

// --- AIEmbeddingJob ---

func TestAIEmbeddingJob_Name(t *testing.T) {
	j := NewAIEmbeddingJob(nil, 0)
	assert.Equal(t, "ai_embedding", j.Name())
}

func TestAIEmbeddingJob_Run_NilAI(t *testing.T) {
	j := NewAIEmbeddingJob(nil, 60)
	assert.NoError(t, j.Run(context.Background()))
}

func TestAIEmbeddingJob_Run_Success(t *testing.T) {
	m := &mockEmbeddingProcessor{}
	j := NewAIEmbeddingJob(m, 120)
	require.NoError(t, j.Run(context.Background()))
	assert.Equal(t, 1, m.callCount)
}

func TestAIEmbeddingJob_Run_Error(t *testing.T) {
	m := &mockEmbeddingProcessor{err: errors.New("embed fail")}
	j := NewAIEmbeddingJob(m, 120)
	err := j.Run(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "process pending embeddings")
}

// --- AISummaryJob ---

func TestAISummaryJob_Name(t *testing.T) {
	j := NewAISummaryJob(nil, 0)
	assert.Equal(t, "ai_summary", j.Name())
}

func TestAISummaryJob_Run_NilDocuments(t *testing.T) {
	j := NewAISummaryJob(nil, 60)
	assert.NoError(t, j.Run(context.Background()))
}

func TestAISummaryJob_Run_Success(t *testing.T) {
	m := &mockSummaryProcessor{}
	j := NewAISummaryJob(m, 300)
	require.NoError(t, j.Run(context.Background()))
	assert.Equal(t, 1, m.callCount)
}

func TestAISummaryJob_Run_Error(t *testing.T) {
	m := &mockSummaryProcessor{err: errors.New("summary fail")}
	j := NewAISummaryJob(m, 300)
	err := j.Run(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "process pending summaries")
}

// --- EmbeddingCacheCleanupJob ---

func TestEmbeddingCacheCleanupJob_Name(t *testing.T) {
	j := NewEmbeddingCacheCleanupJob(nil, 30)
	assert.Equal(t, "embedding_cache_cleanup", j.Name())
}

func TestEmbeddingCacheCleanupJob_Run_NilRepo(t *testing.T) {
	j := NewEmbeddingCacheCleanupJob(nil, 30)
	assert.NoError(t, j.Run(context.Background()))
}

func TestEmbeddingCacheCleanupJob_Run_Success(t *testing.T) {
	m := &mockExpiryCleaner{deleted: 5}
	j := NewEmbeddingCacheCleanupJob(m, 7)
	require.NoError(t, j.Run(context.Background()))
	assert.Equal(t, 1, m.callCount)
}

func TestEmbeddingCacheCleanupJob_Run_DefaultMaxAge(t *testing.T) {
	m := &mockExpiryCleaner{}
	j := NewEmbeddingCacheCleanupJob(m, 0)
	require.NoError(t, j.Run(context.Background()))
	assert.Equal(t, 1, m.callCount)
}

func TestEmbeddingCacheCleanupJob_Run_Error(t *testing.T) {
	m := &mockExpiryCleaner{err: errors.New("db error")}
	j := NewEmbeddingCacheCleanupJob(m, 30)
	err := j.Run(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "delete expired cache")
}

// --- ImportCleanupJob ---

func TestImportCleanupJob_Name(t *testing.T) {
	j := NewImportCleanupJob(nil, nil, time.Hour)
	assert.Equal(t, "import_cleanup", j.Name())
}

func TestImportCleanupJob_Run_NilRepos(t *testing.T) {
	j := NewImportCleanupJob(nil, nil, time.Hour)
	assert.NoError(t, j.Run(context.Background()))
}

func TestImportCleanupJob_Run_NilJobRepo(t *testing.T) {
	j := NewImportCleanupJob(nil, &mockExpiryCleaner{}, time.Hour)
	assert.NoError(t, j.Run(context.Background()))
}

func TestImportCleanupJob_Run_NilNoteRepo(t *testing.T) {
	j := NewImportCleanupJob(&mockExpiryCleaner{}, nil, time.Hour)
	assert.NoError(t, j.Run(context.Background()))
}

func TestImportCleanupJob_Run_Success(t *testing.T) {
	jobM := &mockExpiryCleaner{deleted: 3}
	noteM := &mockExpiryCleaner{deleted: 10}
	j := NewImportCleanupJob(jobM, noteM, 2*time.Hour)
	require.NoError(t, j.Run(context.Background()))
	assert.Equal(t, 1, jobM.callCount)
	assert.Equal(t, 1, noteM.callCount)
}

func TestImportCleanupJob_Run_DefaultMaxAge(t *testing.T) {
	jobM := &mockExpiryCleaner{}
	noteM := &mockExpiryCleaner{}
	j := NewImportCleanupJob(jobM, noteM, 0)
	require.NoError(t, j.Run(context.Background()))
	assert.Equal(t, 1, jobM.callCount)
	assert.Equal(t, 1, noteM.callCount)
}

func TestImportCleanupJob_Run_NoteDeleteError(t *testing.T) {
	jobM := &mockExpiryCleaner{}
	noteM := &mockExpiryCleaner{err: errors.New("note err")}
	j := NewImportCleanupJob(jobM, noteM, time.Hour)
	err := j.Run(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "delete expired notes")
	assert.Equal(t, 0, jobM.callCount, "should not reach job delete")
}

func TestImportCleanupJob_Run_JobDeleteError(t *testing.T) {
	jobM := &mockExpiryCleaner{err: errors.New("job err")}
	noteM := &mockExpiryCleaner{}
	j := NewImportCleanupJob(jobM, noteM, time.Hour)
	err := j.Run(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "delete expired jobs")
}
