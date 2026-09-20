package sibyl

import (
	"context"
	"time"
)

// VirtualClock is a very simple mechanism to allow manipulating time
// inside Go routines. Because Go does not allow monkey patching time.Sleep,
// the SDK provides a wrapper that developers should use in their code.

type Clock interface {
	Now() time.Time
	Sleep(ctx context.Context, duration time.Duration) error
}

type DefaultClock struct{}

func (c *DefaultClock) Now() time.Time {
	return time.Now()
}

func (c *DefaultClock) Sleep(ctx context.Context, duration time.Duration) error {
	select {
	case <-time.After(duration):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

var ActiveClock Clock = &DefaultClock{}

func Now() time.Time {
	return ActiveClock.Now()
}

func Sleep(ctx context.Context, duration time.Duration) error {
	return ActiveClock.Sleep(ctx, duration)
}
