package schedule

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type testJob struct {
	name  string
	count atomic.Int32
	err   error
}

func (j *testJob) Name() string                { return j.name }
func (j *testJob) Run(_ context.Context) error { j.count.Add(1); return j.err }

func TestCronScheduler_AddJob(t *testing.T) {
	s := NewCronScheduler()
	j := &testJob{name: "test_job"}
	err := s.AddJob(j, "* * * * *")
	require.NoError(t, err)
	assert.Contains(t, s.entries, "test_job")
}

func TestCronScheduler_AddJob_InvalidSpec(t *testing.T) {
	s := NewCronScheduler()
	j := &testJob{name: "bad_job"}
	err := s.AddJob(j, "invalid cron")
	assert.Error(t, err)
}

func TestCronScheduler_StartStop(t *testing.T) {
	s := NewCronScheduler()
	j := &testJob{name: "quick_job"}

	require.NoError(t, s.AddJob(j, "* * * * *"))

	ctx, cancel := context.WithCancel(context.Background())
	s.Start(ctx)
	time.Sleep(100 * time.Millisecond)
	cancel()
	s.Stop()
}

func TestCronScheduler_WrapExecutesJob(t *testing.T) {
	s := NewCronScheduler()
	j := &testJob{name: "wrap_test"}

	ctx := context.Background()
	s.ctx = ctx

	fn := s.wrap(j, "* * * * *")
	fn()
	assert.Equal(t, int32(1), j.count.Load())

	fn()
	assert.Equal(t, int32(2), j.count.Load())
}

func TestCronScheduler_WrapNilContext(t *testing.T) {
	s := NewCronScheduler()
	j := &testJob{name: "nil_ctx"}

	fn := s.wrap(j, "* * * * *")
	fn()
	assert.Equal(t, int32(1), j.count.Load())
}

func TestCronScheduler_WrapJobError(t *testing.T) {
	s := NewCronScheduler()
	j := &testJob{name: "error_job", err: assert.AnError}

	s.ctx = context.Background()
	fn := s.wrap(j, "* * * * *")
	fn()
	assert.Equal(t, int32(1), j.count.Load())
}

func TestCronScheduler_WrapSkipsConcurrent(t *testing.T) {
	s := NewCronScheduler()
	s.ctx = context.Background()

	started := make(chan struct{})
	proceed := make(chan struct{})
	j := &blockingJob{name: "blocking", started: started, proceed: proceed}

	fn := s.wrap(j, "* * * * *")

	go fn()
	<-started

	fn()
	assert.Equal(t, int32(0), j.skipped.Load(), "second call should be skipped while first is running")

	close(proceed)
	time.Sleep(50 * time.Millisecond)
}

type blockingJob struct {
	name    string
	started chan struct{}
	proceed chan struct{}
	skipped atomic.Int32
}

func (j *blockingJob) Name() string { return j.name }
func (j *blockingJob) Run(_ context.Context) error {
	j.started <- struct{}{}
	<-j.proceed
	return nil
}
