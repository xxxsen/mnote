package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

const (
	verificationPurposeRegister = "register"
	verificationExpireMinutes   = 10
	verificationCooldownSeconds = 60
)

type EmailVerificationService struct {
	repo   emailVerificationRepo
	sender EmailSender
}

func NewEmailVerificationService(repo emailVerificationRepo, sender EmailSender) *EmailVerificationService {
	return &EmailVerificationService{repo: repo, sender: sender}
}

func (s *EmailVerificationService) SendRegisterCode(ctx context.Context, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return appErr.ErrInvalid
	}
	if err := s.ensureCooldown(ctx, email, verificationPurposeRegister); err != nil {
		return fmt.Errorf("ensure cooldown: %w", err)
	}
	code := s.generateCode()
	hash, err := password.Hash(code)
	if err != nil {
		return fmt.Errorf("hash: %w", err)
	}
	now := timeutil.NowUnix()
	item := &model.EmailVerificationCode{
		ID:        newID(),
		Email:     email,
		Purpose:   verificationPurposeRegister,
		CodeHash:  hash,
		Used:      0,
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
	if err := s.sender.Send(email, "Your verification code", body); err != nil {
		return fmt.Errorf("send verification email: %w", err)
	}
	return nil
}

func (s *EmailVerificationService) VerifyRegisterCode(ctx context.Context, email, code string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return appErr.ErrInvalid
	}
	item, err := s.repo.LatestByEmail(ctx, email, verificationPurposeRegister)
	if err != nil {
		return fmt.Errorf("latest by email: %w", err)
	}
	if item.Used != 0 {
		return appErr.ErrInvalid
	}
	now := timeutil.NowUnix()
	if item.ExpiresAt <= now {
		return appErr.ErrInvalid
	}
	if err := password.Compare(item.CodeHash, code); err != nil {
		return appErr.ErrInvalid
	}
	if err := s.repo.MarkUsed(ctx, item.ID); err != nil {
		return fmt.Errorf("mark used: %w", err)
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
	if item.Ctime+verificationCooldownSeconds > timeutil.NowUnix() {
		return appErr.ErrTooMany
	}
	return nil
}

func (s *EmailVerificationService) generateCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", n.Int64())
}
