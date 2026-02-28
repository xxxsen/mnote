package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/test/testutil"
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

	docs := service.NewDocumentService(docRepo, summaryRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo, nil, 10)
	templates := service.NewTemplateService(templateRepo, docs, tagRepo)

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

func TestTemplateServiceCreateDocumentSkipsDeletedDefaultTags(t *testing.T) {
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

	docs := service.NewDocumentService(docRepo, summaryRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo, nil, 10)
	templates := service.NewTemplateService(templateRepo, docs, tagRepo)
	tags := service.NewTagService(tagRepo, docTagRepo)

	tag, err := tags.Create(context.Background(), "user-1", "MyTag")
	require.NoError(t, err)
	require.NoError(t, tags.Delete(context.Background(), "user-1", tag.ID))

	tpl, err := templates.Create(context.Background(), "user-1", service.CreateTemplateInput{
		Name:          "tpl-with-deleted-tag",
		Content:       "hello",
		DefaultTagIDs: []string{tag.ID},
	})
	require.NoError(t, err)

	doc, err := templates.CreateDocumentFromTemplate(context.Background(), "user-1", service.CreateDocumentFromTemplateInput{
		TemplateID: tpl.ID,
	})
	require.NoError(t, err)

	tagIDs, err := docTagRepo.ListTagIDs(context.Background(), "user-1", doc.ID)
	require.NoError(t, err)
	require.Len(t, tagIDs, 0)
}
