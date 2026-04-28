package errors

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
)

func TestAppError_Error(t *testing.T) {
	tests := []struct {
		name string
		err  *AppError
		want string
	}{
		{"nil", nil, ""},
		{"message_only", New(1, "oops"), "oops"},
		{"cause_only", &AppError{code: 1, cause: errors.New("root")}, "root"},
		{"message_and_cause", Wrap(ErrInternal, "wrap", errors.New("root")), "wrap: root"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.err.Error())
		})
	}
}

func TestAppError_Unwrap(t *testing.T) {
	root := errors.New("root cause")
	wrapped := Wrap(ErrInternal, "msg", root)
	assert.Equal(t, root, wrapped.Unwrap())
	assert.True(t, errors.Is(wrapped, root))
}

func TestAppError_Unwrap_Nil(t *testing.T) {
	var nilErr *AppError
	assert.Nil(t, nilErr.Unwrap())
}

func TestAppError_Is(t *testing.T) {
	a := New(errcode.ErrNotFound, "not found")
	b := New(errcode.ErrNotFound, "different message same code")
	c := New(errcode.ErrInternal, "internal")

	assert.True(t, errors.Is(a, b))
	assert.False(t, errors.Is(a, c))
}

func TestAppError_Is_NilReceiver(t *testing.T) {
	var nilErr *AppError
	assert.False(t, nilErr.Is(ErrNotFound))
}

func TestAppError_Code(t *testing.T) {
	e := New(errcode.ErrForbidden, "forbidden")
	assert.Equal(t, errcode.ErrForbidden, e.Code())
}

func TestAppError_Code_Nil(t *testing.T) {
	var nilErr *AppError
	assert.Equal(t, errcode.ErrInternal, nilErr.Code())
}

func TestAppError_Message(t *testing.T) {
	e := New(errcode.ErrInvalid, "bad request")
	assert.Equal(t, "bad request", e.Message())
}

func TestAppError_Message_Nil(t *testing.T) {
	var nilErr *AppError
	assert.Equal(t, "internal error", nilErr.Message())
}

func TestWrap_NilBase(t *testing.T) {
	wrapped := Wrap(nil, "msg", errors.New("cause"))
	require.NotNil(t, wrapped)
	assert.Equal(t, ErrInternal.code, wrapped.code)
}

func TestWrap_EmptyMessage(t *testing.T) {
	wrapped := Wrap(ErrNotFound, "", errors.New("cause"))
	assert.Equal(t, ErrNotFound.message, wrapped.message)
}

func TestNormalize(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		assert.Nil(t, Normalize(nil))
	})
	t.Run("app_error", func(t *testing.T) {
		ae := New(errcode.ErrNotFound, "not found")
		assert.Equal(t, ae, Normalize(ae))
	})
	t.Run("plain_error", func(t *testing.T) {
		plain := errors.New("something went wrong")
		normalized := Normalize(plain)
		require.NotNil(t, normalized)
		assert.Equal(t, errcode.ErrInternal, normalized.Code())
		assert.True(t, errors.Is(normalized, plain))
	})
}

func TestSentinelErrors(t *testing.T) {
	sentinels := []struct {
		name string
		err  *AppError
		code uint32
	}{
		{"ErrNotFound", ErrNotFound, errcode.ErrNotFound},
		{"ErrUnauthorized", ErrUnauthorized, errcode.ErrUnauthorized},
		{"ErrForbidden", ErrForbidden, errcode.ErrForbidden},
		{"ErrInvalid", ErrInvalid, errcode.ErrInvalid},
		{"ErrConflict", ErrConflict, errcode.ErrConflict},
		{"ErrTooMany", ErrTooMany, errcode.ErrTooMany},
		{"ErrInternal", ErrInternal, errcode.ErrInternal},
	}
	for _, tt := range sentinels {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.code, tt.err.Code())
		})
	}
}

func TestIsNotFound(t *testing.T) {
	assert.True(t, IsNotFound(ErrNotFound))
	assert.True(t, IsNotFound(Wrap(ErrNotFound, "wrapped", nil)))
	assert.False(t, IsNotFound(ErrInternal))
}

func TestIsConflict(t *testing.T) {
	assert.True(t, IsConflict(ErrConflict))
	assert.False(t, IsConflict(ErrNotFound))
}

func TestIsInvalid(t *testing.T) {
	assert.True(t, IsInvalid(ErrInvalid))
	assert.False(t, IsInvalid(ErrConflict))
}

func TestWrapInvalid(t *testing.T) {
	err := WrapInvalid("bad input")
	assert.True(t, IsInvalid(err))
	assert.Contains(t, err.Error(), "bad input")
}
