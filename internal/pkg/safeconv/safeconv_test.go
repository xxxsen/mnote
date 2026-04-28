package safeconv

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUint64ToInt(t *testing.T) {
	tests := []struct {
		name string
		in   uint64
		want int
	}{
		{"zero", 0, 0},
		{"normal", 42, 42},
		{"max_int", uint64(math.MaxInt), math.MaxInt},
		{"overflow", math.MaxUint64, math.MaxInt},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Uint64ToInt(tt.in))
		})
	}
}

func TestUint32ToInt(t *testing.T) {
	tests := []struct {
		name string
		in   uint32
		want int
	}{
		{"zero", 0, 0},
		{"normal", 100, 100},
		{"max", math.MaxUint32, int(math.MaxUint32)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Uint32ToInt(tt.in))
		})
	}
}

func TestUintToInt(t *testing.T) {
	tests := []struct {
		name string
		in   uint
		want int
	}{
		{"zero", 0, 0},
		{"normal", 999, 999},
		{"max_int", uint(math.MaxInt), math.MaxInt},
		{"large", uint(math.MaxInt) + 1, math.MaxInt},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, UintToInt(tt.in))
		})
	}
}
