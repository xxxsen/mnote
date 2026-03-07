package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type TodoRepo struct {
	db *sql.DB
}

func NewTodoRepo(db *sql.DB) *TodoRepo {
	return &TodoRepo{db: db}
}

func (r *TodoRepo) Create(ctx context.Context, todo *model.Todo) error {
	data := map[string]interface{}{
		"id":          todo.ID,
		"marker_id":   todo.MarkerID,
		"user_id":     todo.UserID,
		"document_id": todo.DocumentID,
		"content":     todo.Content,
		"due_date":    todo.DueDate,
		"done":        todo.Done,
		"ctime":       todo.Ctime,
		"mtime":       todo.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("todos", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err := r.db.ExecContext(ctx, sqlStr, args...); err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return err
	}
	return nil
}

func (r *TodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	where := map[string]interface{}{
		"id":      todo.ID,
		"user_id": todo.UserID,
	}
	update := map[string]interface{}{
		"marker_id": todo.MarkerID,
		"content":   todo.Content,
		"due_date":  todo.DueDate,
		"done":      todo.Done,
		"mtime":     todo.Mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("todos", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TodoRepo) UpdateDone(ctx context.Context, userID, id string, done int, mtime int64) error {
	where := map[string]interface{}{
		"id":      id,
		"user_id": userID,
	}
	update := map[string]interface{}{
		"done":  done,
		"mtime": mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("todos", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TodoRepo) GetByID(ctx context.Context, userID, id string) (*model.Todo, error) {
	where := map[string]interface{}{
		"id":      id,
		"user_id": userID,
	}
	sqlStr, args, err := builder.BuildSelect("todos", where, []string{
		"id", "marker_id", "user_id", "document_id", "content", "due_date", "done", "ctime", "mtime",
	})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	row := r.db.QueryRowContext(ctx, sqlStr, args...)
	var todo model.Todo
	if err := row.Scan(&todo.ID, &todo.MarkerID, &todo.UserID, &todo.DocumentID, &todo.Content, &todo.DueDate, &todo.Done, &todo.Ctime, &todo.Mtime); err != nil {
		if err == sql.ErrNoRows {
			return nil, appErr.ErrNotFound
		}
		return nil, err
	}
	return &todo, nil
}

func (r *TodoRepo) ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error) {
	where := map[string]interface{}{
		"user_id":     userID,
		"due_date >=": startDate,
		"due_date <=": endDate,
		"_orderby":    "due_date asc, ctime asc",
	}
	sqlStr, args, err := builder.BuildSelect("todos", where, []string{
		"id", "marker_id", "user_id", "document_id", "content", "due_date", "done", "ctime", "mtime",
	})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]model.Todo, 0)
	for rows.Next() {
		var item model.Todo
		if err := rows.Scan(&item.ID, &item.MarkerID, &item.UserID, &item.DocumentID, &item.Content, &item.DueDate, &item.Done, &item.Ctime, &item.Mtime); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *TodoRepo) Delete(ctx context.Context, userID, id string) error {
	sqlStr, args, err := builder.BuildDelete("todos", map[string]interface{}{
		"id":      id,
		"user_id": userID,
	})
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}
