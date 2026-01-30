package service

import (
	"fmt"
	"net/smtp"
	"strings"

	"github.com/xxxsen/mnote/internal/config"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type EmailSender interface {
	Send(to, subject, body string) error
}

type smtpSender struct {
	cfg config.MailConfig
}

func NewEmailSender(cfg config.MailConfig) EmailSender {
	return &smtpSender{cfg: cfg}
}

func (s *smtpSender) Send(to, subject, body string) error {
	from := strings.TrimSpace(s.cfg.From)
	if s.cfg.Host == "" || s.cfg.Port == 0 || from == "" {
		return appErr.ErrInvalid
	}
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	var auth smtp.Auth
	if s.cfg.Username != "" {
		auth = smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	}
	msg := []byte("From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body)
	return smtp.SendMail(addr, auth, from, []string{to}, msg)
}
