package service

import (
	"errors"
	"net/smtp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizeHeader(t *testing.T) {
	assert.Equal(t, "clean", sanitizeHeader("clean"))
	assert.Equal(t, "noCRLF", sanitizeHeader("no\r\nCRLF"))
	assert.Equal(t, "noCR", sanitizeHeader("no\rCR"))
	assert.Equal(t, "noLF", sanitizeHeader("no\nLF"))
}

func TestNewEmailSender(t *testing.T) {
	sender := NewEmailSender(MailConfig{Host: "smtp.test.com", Port: 587, From: "test@test.com"})
	require.NotNil(t, sender)
}

func TestEmailSender_Send_InvalidConfig(t *testing.T) {
	sender := NewEmailSender(MailConfig{})
	err := sender.Send("to@test.com", "Subject", "Body")
	assert.Error(t, err)
}

func TestEmailSender_Send_MissingHost(t *testing.T) {
	sender := NewEmailSender(MailConfig{Port: 587, From: "test@test.com"})
	err := sender.Send("to@test.com", "Subject", "Body")
	assert.Error(t, err)
}

func TestEmailSender_Send_MissingFrom(t *testing.T) {
	sender := NewEmailSender(MailConfig{Host: "smtp.test.com", Port: 587})
	err := sender.Send("to@test.com", "Subject", "Body")
	assert.Error(t, err)
}

func TestEmailSender_Send_MissingPort(t *testing.T) {
	sender := NewEmailSender(MailConfig{Host: "smtp.test.com", From: "test@test.com"})
	err := sender.Send("to@test.com", "Subject", "Body")
	assert.Error(t, err)
}

func TestEmailSender_Send_Success(t *testing.T) {
	sender := &smtpSender{
		cfg: MailConfig{Host: "smtp.test.com", Port: 587, From: "from@test.com"},
		sendMail: func(addr string, a smtp.Auth, from string, to []string, msg []byte) error {
			assert.Equal(t, "smtp.test.com:587", addr)
			assert.Equal(t, "from@test.com", from)
			assert.Equal(t, []string{"to@test.com"}, to)
			assert.Nil(t, a)
			assert.Contains(t, string(msg), "Subject: Hello")
			return nil
		},
	}
	err := sender.Send("to@test.com", "Hello", "World")
	assert.NoError(t, err)
}

func TestEmailSender_Send_WithAuth(t *testing.T) {
	sender := &smtpSender{
		cfg: MailConfig{
			Host: "smtp.test.com", Port: 587, From: "from@test.com",
			Username: "user", Password: "pass",
		},
		sendMail: func(_ string, a smtp.Auth, _ string, _ []string, _ []byte) error {
			assert.NotNil(t, a)
			return nil
		},
	}
	err := sender.Send("to@test.com", "Sub", "Body")
	assert.NoError(t, err)
}

func TestEmailSender_Send_SmtpError(t *testing.T) {
	sender := &smtpSender{
		cfg: MailConfig{Host: "smtp.test.com", Port: 587, From: "from@test.com"},
		sendMail: func(string, smtp.Auth, string, []string, []byte) error {
			return errors.New("connection refused")
		},
	}
	err := sender.Send("to@test.com", "Sub", "Body")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "send mail")
}
