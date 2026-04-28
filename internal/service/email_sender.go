package service

import (
	"fmt"
	"net/smtp"
	"strings"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type EmailSender interface {
	Send(to, subject, body string) error
}

type sendMailFunc func(addr string, a smtp.Auth, from string, to []string, msg []byte) error

type MailConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

type smtpSender struct {
	cfg      MailConfig
	sendMail sendMailFunc
}

func NewEmailSender(cfg MailConfig) EmailSender {
	return &smtpSender{cfg: cfg, sendMail: smtp.SendMail}
}

func sanitizeHeader(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	return s
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
	msg := []byte("From: " + sanitizeHeader(from) + "\r\n" +
		"To: " + sanitizeHeader(to) + "\r\n" +
		"Subject: " + sanitizeHeader(subject) + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body)
	if err := s.sendMail(addr, auth, from, []string{to}, msg); err != nil {
		return fmt.Errorf("send mail: %w", err)
	}
	return nil
}
