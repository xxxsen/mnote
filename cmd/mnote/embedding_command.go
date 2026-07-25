package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/db"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

type embeddingCommandRuntime struct {
	config *config.Config
	db     *sql.DB
	repo   *repo.EmbeddingV2Repo
	cache  *repo.EmbeddingCacheV2Repo
}

var (
	errEmbeddingConfigRequired      = errors.New("--config is required")
	errEmbeddingProfileRequired     = errors.New("--profile is required")
	errEmbeddingGenerationRequired  = errors.New("--generation is required")
	errEmbeddingReasonInvalid       = errors.New("--reason must be initial, model_change, rechunk, or manual_repair")
	errEmbeddingProfileUnavailable  = errors.New("embedding profile is not in the current config")
	errEmbeddingProviderUnavailable = errors.New("embedding provider not found")
	errEmbeddingPreflightDimensions = errors.New("embedding profile preflight returned invalid dimensions")
)

func newEmbeddingCommand() *cobra.Command {
	var configPath string
	command := &cobra.Command{
		Use:   "embedding",
		Short: "manage embedding index generations",
	}
	command.PersistentFlags().StringVar(
		&configPath,
		"config",
		"",
		"path to config.json",
	)
	command.AddCommand(
		newEmbeddingStatusCommand(&configPath),
		newEmbeddingRebuildCommand(&configPath),
		newEmbeddingRetryCommand(&configPath),
		newEmbeddingActivateCommand(&configPath),
		newEmbeddingRollbackCommand(&configPath),
		newEmbeddingRetireCommand(&configPath),
	)
	return command
}

func newEmbeddingStatusCommand(configPath *string) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "show embedding generation coverage and queue status",
		RunE: func(command *cobra.Command, _ []string) error {
			runtime, err := openEmbeddingCommandRuntime(
				command.Context(),
				*configPath,
			)
			if err != nil {
				return err
			}
			defer func() { _ = runtime.db.Close() }()
			now := time.Now().Unix()
			generations, err := runtime.repo.ListGenerations(command.Context())
			if err != nil {
				return fmt.Errorf("list embedding generations: %w", err)
			}
			statuses := make([]map[string]any, 0, len(generations))
			for _, generation := range generations {
				if generation.Status != model.EmbeddingGenerationActive &&
					generation.Status != model.EmbeddingGenerationBuilding &&
					generation.Status != model.EmbeddingGenerationStandby {
					continue
				}
				stats, err := runtime.repo.GenerationStats(
					command.Context(),
					generation.ID,
					now,
				)
				if err != nil {
					return fmt.Errorf(
						"read embedding generation %s status: %w",
						generation.ID,
						err,
					)
				}
				oldestReadySeconds := int64(0)
				if stats.OldestReadyAt > 0 && stats.OldestReadyAt < now {
					oldestReadySeconds = now - stats.OldestReadyAt
				}
				statuses = append(statuses, map[string]any{
					"generation":                stats.Generation,
					"profile":                   stats.Profile,
					"normal_documents":          stats.NormalDocuments,
					"current":                   stats.Current,
					"succeeded":                 stats.Succeeded,
					"pending":                   stats.Pending,
					"running":                   stats.Running,
					"failed":                    stats.Failed,
					"dead":                      stats.Dead,
					"missing":                   stats.Missing,
					"hash_drift":                stats.HashDrift,
					"oldest_ready_wait_seconds": oldestReadySeconds,
					"can_activate":              stats.CanActivate,
				})
			}
			cooldowns, err := runtime.repo.ListCooldowns(command.Context(), "")
			if err != nil {
				return fmt.Errorf("list embedding provider cooldowns: %w", err)
			}
			return writeCommandJSON(command, map[string]any{
				"generations": statuses,
				"cooldowns":   cooldowns,
			})
		},
	}
}

func newEmbeddingRebuildCommand(configPath *string) *cobra.Command {
	var profileID string
	var reason string
	var restart bool
	command := &cobra.Command{
		Use:   "rebuild",
		Short: "create or resume a shadow embedding generation",
		RunE: func(command *cobra.Command, _ []string) error {
			if profileID == "" {
				return errEmbeddingProfileRequired
			}
			switch reason {
			case "initial", "model_change", "rechunk", "manual_repair":
			default:
				return errEmbeddingReasonInvalid
			}
			runtime, err := openEmbeddingCommandRuntime(
				command.Context(),
				*configPath,
			)
			if err != nil {
				return fmt.Errorf("create building embedding generation: %w", err)
			}
			defer func() { _ = runtime.db.Close() }()
			profile, embedder, err := commandProfileEmbedder(
				command.Context(),
				runtime,
				profileID,
			)
			if err != nil {
				return err
			}
			if err := preflightEmbeddingProfile(
				command.Context(),
				profile,
				embedder,
			); err != nil {
				return err
			}
			generation, err := runtime.repo.CreateBuildingGeneration(
				command.Context(),
				profile.ID,
				reason,
				restart,
				time.Now().Unix(),
			)
			if err != nil {
				return fmt.Errorf("create building embedding generation: %w", err)
			}
			return writeCommandJSON(command, map[string]any{
				"generation_id": generation.ID,
				"profile_id":    generation.ProfileID,
				"status":        generation.Status,
			})
		},
	}
	command.Flags().StringVar(&profileID, "profile", "", "configured embedding profile id")
	command.Flags().StringVar(&reason, "reason", "manual_repair", "rebuild reason")
	command.Flags().BoolVar(&restart, "restart", false, "replace the current building generation")
	return command
}

func newEmbeddingRetryCommand(configPath *string) *cobra.Command {
	var generationID string
	var documentID string
	command := &cobra.Command{
		Use:   "retry",
		Short: "retry failed or dead embedding jobs",
		RunE: func(command *cobra.Command, _ []string) error {
			if generationID == "" {
				return errEmbeddingGenerationRequired
			}
			runtime, err := openEmbeddingCommandRuntime(
				command.Context(),
				*configPath,
			)
			if err != nil {
				return fmt.Errorf("retry embedding jobs: %w", err)
			}
			defer func() { _ = runtime.db.Close() }()
			affected, err := runtime.repo.RetryJobs(
				command.Context(),
				generationID,
				documentID,
				time.Now().Unix(),
			)
			if err != nil {
				return fmt.Errorf("retry embedding jobs: %w", err)
			}
			return writeCommandJSON(command, map[string]any{
				"generation_id": generationID,
				"document_id":   documentID,
				"retried":       affected,
			})
		},
	}
	command.Flags().StringVar(&generationID, "generation", "", "embedding generation id")
	command.Flags().StringVar(&documentID, "document", "", "optional document id")
	return command
}

func newEmbeddingActivateCommand(configPath *string) *cobra.Command {
	return newEmbeddingTransitionCommand(
		configPath,
		"activate",
		"atomically activate a complete shadow generation",
		false,
	)
}

func newEmbeddingRollbackCommand(configPath *string) *cobra.Command {
	return newEmbeddingTransitionCommand(
		configPath,
		"rollback",
		"switch back to a current standby generation",
		true,
	)
}

func newEmbeddingTransitionCommand(
	configPath *string,
	use, short string,
	rollback bool,
) *cobra.Command {
	var generationID string
	command := &cobra.Command{
		Use:   use,
		Short: short,
		RunE: func(command *cobra.Command, _ []string) error {
			return runEmbeddingTransition(
				command,
				*configPath,
				generationID,
				rollback,
			)
		},
	}
	command.Flags().StringVar(&generationID, "generation", "", "embedding generation id")
	return command
}

func runEmbeddingTransition(
	command *cobra.Command,
	configPath, generationID string,
	rollback bool,
) error {
	runtime, profile, embedder, err := prepareGenerationTransition(
		command,
		configPath,
		generationID,
	)
	if err != nil {
		return err
	}
	defer func() { _ = runtime.db.Close() }()
	if err := preflightEmbeddingProfile(
		command.Context(),
		profile,
		embedder,
	); err != nil {
		return err
	}
	if err := runtime.repo.ValidateGenerationVectors(
		command.Context(),
		generationID,
		100,
	); err != nil {
		return fmt.Errorf("validate embedding generation vectors: %w", err)
	}
	now := time.Now().Unix()
	standbySeconds := int64(runtime.config.AI.StandbyHours) * 60 * 60
	if rollback {
		err = runtime.repo.RollbackGeneration(
			command.Context(),
			generationID,
			now,
			standbySeconds,
		)
	} else {
		err = runtime.repo.ActivateGeneration(
			command.Context(),
			generationID,
			now,
			standbySeconds,
		)
	}
	if err != nil {
		return fmt.Errorf("%s embedding generation: %w", command.Name(), err)
	}
	return writeCommandJSON(command, map[string]any{
		"generation_id": generationID,
		"status":        model.EmbeddingGenerationActive,
	})
}

func newEmbeddingRetireCommand(configPath *string) *cobra.Command {
	var generationID string
	command := &cobra.Command{
		Use:   "retire",
		Short: "retire an expired standby generation",
		RunE: func(command *cobra.Command, _ []string) error {
			if generationID == "" {
				return errEmbeddingGenerationRequired
			}
			runtime, err := openEmbeddingCommandRuntime(
				command.Context(),
				*configPath,
			)
			if err != nil {
				return err
			}
			defer func() { _ = runtime.db.Close() }()
			if err := runtime.repo.RetireGeneration(
				command.Context(),
				generationID,
				time.Now().Unix(),
			); err != nil {
				return fmt.Errorf("retire embedding generation: %w", err)
			}
			return writeCommandJSON(command, map[string]any{
				"generation_id": generationID,
				"status":        model.EmbeddingGenerationRetired,
			})
		},
	}
	command.Flags().StringVar(&generationID, "generation", "", "embedding generation id")
	return command
}

func prepareGenerationTransition(
	command *cobra.Command,
	configPath, generationID string,
) (
	*embeddingCommandRuntime,
	model.EmbeddingProfile,
	ai.ProfileEmbedder,
	error,
) {
	if generationID == "" {
		return nil, model.EmbeddingProfile{}, nil, errEmbeddingGenerationRequired
	}
	runtime, err := openEmbeddingCommandRuntime(command.Context(), configPath)
	if err != nil {
		return nil, model.EmbeddingProfile{}, nil, err
	}
	generation, err := runtime.repo.GetGeneration(command.Context(), generationID)
	if err != nil {
		_ = runtime.db.Close()
		return nil, model.EmbeddingProfile{}, nil, fmt.Errorf(
			"get embedding generation: %w",
			err,
		)
	}
	profile, embedder, err := commandProfileEmbedder(
		command.Context(),
		runtime,
		generation.ProfileID,
	)
	if err != nil {
		_ = runtime.db.Close()
		return nil, model.EmbeddingProfile{}, nil, err
	}
	return runtime, profile, embedder, nil
}

func commandProfileEmbedder(
	ctx context.Context,
	runtime *embeddingCommandRuntime,
	profileID string,
) (model.EmbeddingProfile, ai.ProfileEmbedder, error) {
	var selected *config.AIProfileConfig
	for index := range runtime.config.AI.Profiles {
		if runtime.config.AI.Profiles[index].ID == profileID {
			selected = &runtime.config.AI.Profiles[index]
			break
		}
	}
	if selected == nil {
		return model.EmbeddingProfile{}, nil, fmt.Errorf(
			"%w: %q",
			errEmbeddingProfileUnavailable,
			profileID,
		)
	}
	profile := model.EmbeddingProfile{
		ID:               selected.ID,
		Fingerprint:      selected.Fingerprint(),
		SpaceID:          selected.SpaceID,
		Model:            selected.Model,
		Dimensions:       selected.Dimensions,
		Metric:           selected.Metric,
		QueryTaskType:    selected.QueryTaskType,
		DocumentTaskType: selected.DocumentTaskType,
		ChunkerVersion:   selected.ChunkerVersion,
		Ctime:            time.Now().Unix(),
	}
	if err := runtime.repo.EnsureProfile(ctx, profile); err != nil {
		return model.EmbeddingProfile{}, nil, fmt.Errorf(
			"ensure embedding profile: %w",
			err,
		)
	}
	providers, err := initEmbeddingProviders(ctx, runtime.config)
	if err != nil {
		return model.EmbeddingProfile{}, nil, err
	}
	endpoints := make([]ai.ProfileProvider, 0, len(selected.Providers))
	for _, providerName := range selected.Providers {
		provider := providers[providerName]
		if provider == nil {
			return model.EmbeddingProfile{}, nil, fmt.Errorf(
				"%w: %q",
				errEmbeddingProviderUnavailable,
				providerName,
			)
		}
		endpoints = append(endpoints, ai.ProfileProvider{
			Name:     providerName,
			Provider: provider,
		})
	}
	embedder, err := ai.NewProfileEmbedder(
		ai.ProfileIdentity{
			ID:               profile.ID,
			Fingerprint:      profile.Fingerprint,
			SpaceID:          profile.SpaceID,
			Model:            profile.Model,
			Dimensions:       profile.Dimensions,
			QueryTaskType:    profile.QueryTaskType,
			DocumentTaskType: profile.DocumentTaskType,
		},
		endpoints,
		time.Duration(runtime.config.AI.RequestTimeoutSeconds)*time.Second,
		runtime.cache,
	)
	if err != nil {
		return model.EmbeddingProfile{}, nil, fmt.Errorf(
			"create embedding profile client: %w",
			err,
		)
	}
	return profile, embedder, nil
}

func preflightEmbeddingProfile(
	ctx context.Context,
	profile model.EmbeddingProfile,
	embedder ai.ProfileEmbedder,
) error {
	checks := []ai.EmbeddingRequest{
		{
			Inputs:   []string{"mnote embedding query health check"},
			TaskType: profile.QueryTaskType,
		},
		{
			Inputs:   []string{"mnote embedding document health check"},
			TaskType: profile.DocumentTaskType,
		},
	}
	for _, request := range checks {
		result, err := embedder.EmbedBatch(ctx, request)
		if err != nil {
			return fmt.Errorf("embedding profile preflight: %w", err)
		}
		if len(result.Vectors) != 1 ||
			len(result.Vectors[0]) != profile.Dimensions {
			return errEmbeddingPreflightDimensions
		}
	}
	return nil
}

func openEmbeddingCommandRuntime(
	ctx context.Context,
	configPath string,
) (*embeddingCommandRuntime, error) {
	if configPath == "" {
		return nil, errEmbeddingConfigRequired
	}
	cfg, err := loadValidatedConfig(configPath)
	if err != nil {
		return nil, err
	}
	database, err := db.Open(ctx, db.Config{
		DSN:             cfg.Database.DSN,
		Host:            cfg.Database.Host,
		Port:            cfg.Database.Port,
		User:            cfg.Database.User,
		Password:        cfg.Database.Password,
		DBName:          cfg.Database.DBName,
		SSLMode:         cfg.Database.SSLMode,
		MaxOpenConns:    cfg.Database.MaxOpenConns,
		MaxIdleConns:    cfg.Database.MaxIdleConns,
		ConnMaxLifetime: time.Duration(cfg.Database.ConnMaxLifetimeSeconds) * time.Second,
		ConnMaxIdleTime: time.Duration(cfg.Database.ConnMaxIdleTimeSeconds) * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := db.ApplyMigrationsContext(ctx, database); err != nil {
		_ = database.Close()
		return nil, fmt.Errorf("migrations: %w", err)
	}
	return &embeddingCommandRuntime{
		config: cfg,
		db:     database,
		repo:   repo.NewEmbeddingV2Repo(database),
		cache:  repo.NewEmbeddingCacheV2Repo(database),
	}, nil
}

func writeCommandJSON(command *cobra.Command, value any) error {
	encoder := json.NewEncoder(command.OutOrStdout())
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return fmt.Errorf("write command output: %w", err)
	}
	return nil
}
