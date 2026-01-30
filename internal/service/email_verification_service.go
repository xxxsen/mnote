package service

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

const (
	verificationPurposeRegister = "register"
	verificationExpireMinutes   = 10
	verificationCooldownSeconds = 60
)

type EmailVerificationService struct {
	repo   *repo.EmailVerificationRepo
	sender EmailSender
}

func NewEmailVerificationService(repo *repo.EmailVerificationRepo, sender EmailSender) *EmailVerificationService {
	return &EmailVerificationService{repo: repo, sender: sender}
}

func (s *EmailVerificationService) SendRegisterCode(ctx context.Context, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return appErr.ErrInvalid
	}
	if err := s.ensureCooldown(ctx, email, verificationPurposeRegister); err != nil {
		return err
	}
	code := s.generateCode()
	hash, err := password.Hash(code)
	if err != nil {
		return err
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
		return err
	}
	return s.sender.Send(email, "Your verification code", fmt.Sprintf("Your verification code is %s. It expires in %d minutes.", code, verificationExpireMinutes))
}

func (s *EmailVerificationService) VerifyRegisterCode(ctx context.Context, email, code string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return appErr.ErrInvalid
	}
	item, err := s.repo.LatestByEmail(ctx, email, verificationPurposeRegister)
	if err != nil {
		return err
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
	return s.repo.MarkUsed(ctx, item.ID)
}

func (s *EmailVerificationService) ensureCooldown(ctx context.Context, email, purpose string) error {
	item, err := s.repo.LatestByEmail(ctx, email, purpose)
	if err != nil {
		if err == appErr.ErrNotFound {
			return nil
		}
		return err
	}
	if item.Ctime+verificationCooldownSeconds > timeutil.NowUnix() {
		return appErr.ErrTooMany
	}
	return nil
}

func (s *EmailVerificationService) generateCode() string {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("%06d", rng.Intn(1000000))
}
