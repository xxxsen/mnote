package service

import (
	"context"
	"time"

	"github.com/xxxsen/mnote/internal/pkg/idgen"
)

type Transactor interface {
	WithinTransaction(ctx context.Context, fn func(context.Context) error) error
}

type Clock interface {
	Now() time.Time
}

type RealClock struct{}

func (RealClock) Now() time.Time {
	return time.Now()
}

type Runtime struct {
	Transactor Transactor
	Clock      Clock
	IDs        idgen.Generator
	Limits     Limits
}

func NewRuntime(transactor Transactor) Runtime {
	if transactor == nil {
		panic("service runtime requires a transactor")
	}
	return Runtime{
		Transactor: transactor,
		Clock:      RealClock{},
		IDs:        idgen.NewCrypto(),
		Limits:     DefaultLimits(),
	}
}

func prepareRuntime(runtime Runtime) Runtime {
	runtime.validate()
	runtime.Limits = runtime.Limits.withDefaults()
	return runtime
}

func (runtime Runtime) validate() {
	if runtime.Transactor == nil {
		panic("service runtime requires a transactor")
	}
	if runtime.Clock == nil {
		panic("service runtime requires a clock")
	}
	if runtime.IDs == nil {
		panic("service runtime requires an ID generator")
	}
}
