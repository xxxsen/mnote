package schedule

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"
)

type Job interface {
	Name() string
	Run(ctx context.Context) error
}

type Scheduler interface {
	AddJob(job Job, spec string) error
	Start(ctx context.Context)
	Stop()
}

type CronScheduler struct {
	cron    *cron.Cron
	entries map[string]cron.EntryID
	ctx     context.Context
}

func NewCronScheduler() *CronScheduler {
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	return &CronScheduler{
		cron:    cron.New(cron.WithParser(parser)),
		entries: make(map[string]cron.EntryID),
	}
}

func (c *CronScheduler) AddJob(job Job, spec string) error {
	name := job.Name()
	logger := logutil.GetLogger(context.Background()).With(zap.String("job", name), zap.String("spec", spec))
	entryID, err := c.cron.AddFunc(spec, c.wrap(job, spec))
	if err != nil {
		logger.Error("schedule job failed", zap.Error(err))
		return err
	}
	c.entries[name] = entryID
	logger.Info("job scheduled")
	return nil
}

func (c *CronScheduler) Start(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}
	c.ctx = ctx
	c.cron.Start()
}

func (c *CronScheduler) Stop() {
	ctx := c.cron.Stop()
	<-ctx.Done()
}

func (c *CronScheduler) wrap(job Job, spec string) func() {
	var running atomic.Bool
	return func() {
		if !running.CompareAndSwap(false, true) {
			logutil.GetLogger(context.Background()).With(
				zap.String("job", job.Name()),
				zap.String("spec", spec),
			).Info("job skipped: still running")
			return
		}
		defer running.Store(false)

		ctx := c.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		logger := logutil.GetLogger(ctx).With(
			zap.String("job", job.Name()),
			zap.String("spec", spec),
		)
		start := time.Now()
		logger.Info("job started")
		err := job.Run(ctx)
		elapsed := time.Since(start)
		if err != nil {
			logger.Error("job finished", zap.Error(err), zap.Duration("duration", elapsed))
			return
		}
		logger.Info("job finished", zap.Duration("duration", elapsed))
	}
}
