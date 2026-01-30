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

func decodeProviderArgs(args interface{}) (ProviderArgs, error) {
	if args == nil {
		return ProviderArgs{}, nil
	}
	if cfg, ok := args.(ProviderArgs); ok {
		cfg.Config.RedirectURL = strings.TrimSpace(cfg.Config.RedirectURL)
		cfg.Config.ClientID = strings.TrimSpace(cfg.Config.ClientID)
		cfg.Config.ClientSecret = strings.TrimSpace(cfg.Config.ClientSecret)
		return cfg, nil
	}
	return ProviderArgs{}, nil
}
