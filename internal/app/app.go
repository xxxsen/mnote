package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

type Scheduler interface {
	Start(context.Context)
	Stop()
}

type Worker interface {
	Run(context.Context) error
}

type Config struct {
	Address         string
	Handler         http.Handler
	DB              *sql.DB
	Scheduler       Scheduler
	Workers         []Worker
	ShutdownTimeout time.Duration
	WorkerTimeout   time.Duration
}

type App struct {
	db              *sql.DB
	scheduler       Scheduler
	workers         []Worker
	server          *http.Server
	shutdownTimeout time.Duration
	workerTimeout   time.Duration
	ready           atomic.Bool
}

var (
	errInvalidConfig     = errors.New("address, handler, and database are required")
	errNilWorker         = errors.New("background worker must not be nil")
	errWorkerStopTimeout = errors.New("background workers did not stop before timeout")
)

func New(config Config) (*App, error) {
	if config.Address == "" || config.Handler == nil || config.DB == nil {
		return nil, errInvalidConfig
	}
	for _, worker := range config.Workers {
		if worker == nil {
			return nil, errNilWorker
		}
	}
	if config.ShutdownTimeout <= 0 {
		config.ShutdownTimeout = 15 * time.Second
	}
	if config.WorkerTimeout <= 0 {
		config.WorkerTimeout = 30 * time.Second
	}
	app := &App{
		db: config.DB, scheduler: config.Scheduler, workers: config.Workers,
		shutdownTimeout: config.ShutdownTimeout,
		workerTimeout:   config.WorkerTimeout,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", app.live)
	mux.HandleFunc("GET /health/ready", app.readiness)
	mux.Handle("/", config.Handler)
	app.server = &http.Server{
		Addr:              config.Address,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	return app, nil
}

func (app *App) Handler() http.Handler {
	return app.server.Handler
}

func (app *App) Run(ctx context.Context) error {
	workerCtx, cancelWorkers := context.WithCancel(ctx)
	defer cancelWorkers()
	if app.scheduler != nil {
		app.scheduler.Start(workerCtx)
	}
	workerErr, workerGroup := app.startWorkers(workerCtx)
	app.ready.Store(true)
	serverErr := app.startHTTP()
	runErr := waitForRunEnd(ctx, serverErr, workerErr)
	app.ready.Store(false)

	shutdownErr := app.shutdown(ctx, cancelWorkers, workerGroup)
	if runErr != nil {
		return runErr
	}
	return shutdownErr
}

func (app *App) startWorkers(ctx context.Context) (<-chan error, *sync.WaitGroup) {
	workerErr := make(chan error, len(app.workers))
	var workerGroup sync.WaitGroup
	for _, worker := range app.workers {
		workerGroup.Add(1)
		go func(worker Worker) {
			defer workerGroup.Done()
			if err := worker.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
				select {
				case workerErr <- err:
				default:
				}
			}
		}(worker)
	}
	return workerErr, &workerGroup
}

func (app *App) startHTTP() <-chan error {
	serverErr := make(chan error, 1)
	go func() {
		err := app.server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		serverErr <- err
	}()
	return serverErr
}

func waitForRunEnd(
	ctx context.Context, serverErr, workerErr <-chan error,
) error {
	select {
	case <-ctx.Done():
		return nil
	case err := <-serverErr:
		if err != nil {
			return fmt.Errorf("listen and serve: %w", err)
		}
		return nil
	case err := <-workerErr:
		return fmt.Errorf("background worker: %w", err)
	}
}

func (app *App) shutdown(
	parent context.Context, cancelWorkers context.CancelFunc, workerGroup *sync.WaitGroup,
) error {
	var shutdownErr error
	shutdownCtx, cancelShutdown := context.WithTimeout(
		context.WithoutCancel(parent), app.shutdownTimeout,
	)
	if err := app.server.Shutdown(shutdownCtx); err != nil {
		shutdownErr = fmt.Errorf("shutdown http server: %w", err)
	}
	cancelShutdown()

	cancelWorkers()
	workersStopped := make(chan struct{})
	go func() {
		workerGroup.Wait()
		close(workersStopped)
	}()
	if app.scheduler != nil {
		stopped := make(chan struct{})
		go func() {
			app.scheduler.Stop()
			close(stopped)
		}()
		select {
		case <-stopped:
		case <-time.After(app.workerTimeout):
			if shutdownErr == nil {
				shutdownErr = errWorkerStopTimeout
			}
		}
	}
	select {
	case <-workersStopped:
	case <-time.After(app.workerTimeout):
		if shutdownErr == nil {
			shutdownErr = errWorkerStopTimeout
		}
	}
	if err := app.db.Close(); err != nil && shutdownErr == nil {
		shutdownErr = fmt.Errorf("close database: %w", err)
	}
	return shutdownErr
}

func (app *App) live(writer http.ResponseWriter, _ *http.Request) {
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte("ok"))
}

func (app *App) readiness(writer http.ResponseWriter, request *http.Request) {
	if !app.ready.Load() {
		http.Error(writer, "not ready", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), time.Second)
	defer cancel()
	if err := app.db.PingContext(ctx); err != nil {
		http.Error(writer, "not ready", http.StatusServiceUnavailable)
		return
	}
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte("ok"))
}
