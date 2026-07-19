package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
)

const (
	verificationPurposeRegister = "register"
	verificationExpireMinutes   = 10
	verificationCooldownSeconds = 60
)

type EmailVerificationService struct {
	repo    emailVerificationRepo
	sender  EmailSender
	runtime Runtime
}

func NewEmailVerificationService(
	repo emailVerificationRepo, sender EmailSender, runtime Runtime,
) *EmailVerificationService {
	runtime = prepareRuntime(runtime)
	return &EmailVerificationService{repo: repo, sender: sender, runtime: runtime}
}

func (s *EmailVerificationService) SendRegisterCode(ctx context.Context, email string) error {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	if err := s.ensureCooldown(ctx, normalized, verificationPurposeRegister); err != nil {
		return fmt.Errorf("ensure cooldown: %w", err)
	}
	code, err := s.runtime.IDs.Digits(6)
	if err != nil {
		return fmt.Errorf("generate verification code: %w", err)
	}
	hash, err := password.Hash(code)
	if err != nil {
		return fmt.Errorf("hash: %w", err)
	}
	id, err := s.runtime.IDs.ID()
	if err != nil {
		return fmt.Errorf("generate verification id: %w", err)
	}
	now := s.runtime.Clock.Now().Unix()
	item := &model.EmailVerificationCode{
		ID:        id,
		Email:     normalized,
		Purpose:   verificationPurposeRegister,
		CodeHash:  hash,
		Used:      0,
		Status:    "pending",
		Ctime:     now,
		ExpiresAt: now + int64(verificationExpireMinutes*60),
	}
	if err := s.repo.Create(ctx, item); err != nil {
		return fmt.Errorf("create: %w", err)
	}
	body := fmt.Sprintf(
		"Your verification code is %s. It expires in %d minutes.",
		code, verificationExpireMinutes,
	)
	if err := s.sender.Send(normalized, "Your verification code", body); err != nil {
		if statusErr := s.repo.MarkStatus(ctx, item.ID, "failed"); statusErr != nil {
			return fmt.Errorf(
				"send verification email and mark failed: %w",
				errors.Join(err, statusErr),
			)
		}
		return fmt.Errorf("send verification email: %w", err)
	}
	if err := s.repo.MarkStatus(ctx, item.ID, "sent"); err != nil {
		return fmt.Errorf("mark verification sent: %w", err)
	}
	return nil
}

func (s *EmailVerificationService) ValidateRegisterCode(
	ctx context.Context, email, code string,
) (*model.EmailVerificationCode, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return nil, err
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, appErr.ErrInvalid
	}
	item, err := s.repo.LatestByEmail(ctx, normalized, verificationPurposeRegister)
	if err != nil {
		if errors.Is(err, appErr.ErrNotFound) {
			return nil, appErr.ErrInvalid
		}
		return nil, fmt.Errorf("latest by email: %w", err)
	}
	if item.Used != 0 {
		return nil, appErr.ErrInvalid
	}
	now := s.runtime.Clock.Now().Unix()
	if item.ExpiresAt <= now {
		return nil, appErr.ErrInvalid
	}
	if err := password.Compare(item.CodeHash, code); err != nil {
		return nil, appErr.ErrInvalid
	}
	return item, nil
}

// VerifyRegisterCode is kept for callers that only need standalone
// verification. Account registration uses ValidateRegisterCode and consumes
// the code inside the user-creation transaction.
func (s *EmailVerificationService) VerifyRegisterCode(ctx context.Context, email, code string) error {
	item, err := s.ValidateRegisterCode(ctx, email, code)
	if err != nil {
		return err
	}
	if err := s.repo.ConsumeIfUnused(ctx, item.ID, s.runtime.Clock.Now().Unix()); err != nil {
		return fmt.Errorf("consume verification code: %w", err)
	}
	return nil
}

func (s *EmailVerificationService) ensureCooldown(ctx context.Context, email, purpose string) error {
	item, err := s.repo.LatestByEmail(ctx, email, purpose)
	if err != nil {
		if errors.Is(err, appErr.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("query latest by email: %w", err)
	}
	if item.Ctime+verificationCooldownSeconds > s.runtime.Clock.Now().Unix() {
		return appErr.ErrTooMany
	}
	return nil
}
