package oauth

import (
	"net/http"
	"strings"
)

type ProviderConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
}

type ProviderArgs struct {
	Config ProviderConfig
	Client *http.Client
}

func decodeProviderArgs(args any) ProviderArgs {
	if args == nil {
		return ProviderArgs{}
	}
	cfg, ok := args.(ProviderArgs)
	if !ok {
		return ProviderArgs{}
	}
	cfg.Config.RedirectURL = strings.TrimSpace(cfg.Config.RedirectURL)
	cfg.Config.ClientID = strings.TrimSpace(cfg.Config.ClientID)
	cfg.Config.ClientSecret = strings.TrimSpace(cfg.Config.ClientSecret)
	return cfg
}
