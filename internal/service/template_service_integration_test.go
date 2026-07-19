//go:build integration

package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/internal/testutil"
)

func TestTemplateServiceSystemVariables(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docRepo := repo.NewDocumentRepo(db)
	summaryRepo := repo.NewDocumentSummaryRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	tagRepo := repo.NewTagRepo(db)
	userRepo := repo.NewUserRepo(db)
	templateRepo := repo.NewTemplateRepo(db)
	runtime := service.NewRuntime(repo.NewTransactor(db))

	docs := service.NewDocumentService(
		runtime, docRepo, summaryRepo, versionRepo, docTagRepo, shareRepo,
		tagRepo, userRepo, nil, 10, nil)

	templates := service.NewTemplateService(templateRepo, docs, tagRepo, runtime)

	tpl, err := templates.Create(context.Background(), "user-1", service.CreateTemplateInput{
		Name:    "tpl",
		Content: "Today={{sys:today}} Date={{SYS:DATE}} Time={{sys:time}}",
	})
	require.NoError(t, err)

	doc, err := templates.CreateDocumentFromTemplate(context.Background(), "user-1", service.CreateDocumentFromTemplateInput{
		TemplateID: tpl.ID,
		Variables:  map[string]string{},
	})
	require.NoError(t, err)

	require.NotContains(t, doc.Content, "{{sys:today}}")
	require.NotContains(t, doc.Content, "{{SYS:DATE}}")
	require.NotContains(t, doc.Content, "{{sys:time}}")
	require.True(t, strings.Contains(doc.Content, "Today=") && strings.Contains(doc.Content, "Date=") && strings.Contains(doc.Content, "Time="))
}

func TestTemplateServiceCreateRejectsDeletedDefaultTags(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docRepo := repo.NewDocumentRepo(db)
	summaryRepo := repo.NewDocumentSummaryRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	tagRepo := repo.NewTagRepo(db)
	userRepo := repo.NewUserRepo(db)
	templateRepo := repo.NewTemplateRepo(db)
	runtime := service.NewRuntime(repo.NewTransactor(db))

	docs := service.NewDocumentService(
		runtime, docRepo, summaryRepo, versionRepo, docTagRepo, shareRepo,
		tagRepo, userRepo, nil, 10, nil)

	templates := service.NewTemplateService(templateRepo, docs, tagRepo, runtime)
	tags := service.NewTagService(runtime, tagRepo, docTagRepo)

	tag, err := tags.Create(context.Background(), "user-1", "MyTag")
	require.NoError(t, err)
	require.NoError(t, tags.Delete(context.Background(), "user-1", tag.ID))

	_, err = templates.Create(context.Background(), "user-1", service.CreateTemplateInput{
		Name:          "tpl-with-deleted-tag",
		Content:       "hello",
		DefaultTagIDs: []string{tag.ID},
	})
	require.ErrorIs(t, err, appErr.ErrInvalid)
}
