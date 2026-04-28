package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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
	data := map[string]any{
		"id":       todo.ID,
		"user_id":  todo.UserID,
		"content":  todo.Content,
		"due_date": todo.DueDate,
		"done":     todo.Done,
		"ctime":    todo.Ctime,
		"mtime":    todo.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("todos", []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...); err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *TodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	where := map[string]any{
		"id":      todo.ID,
		"user_id": todo.UserID,
	}
	update := map[string]any{
		"content":  todo.Content,
		"due_date": todo.DueDate,
		"done":     todo.Done,
		"mtime":    todo.Mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("todos", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TodoRepo) UpdateDone(ctx context.Context, userID, id string, done int, mtime int64) error {
	where := map[string]any{"id": id, "user_id": userID}
	update := map[string]any{"done": done, "mtime": mtime}
	sqlStr, args, err := builder.BuildUpdate("todos", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	affected, err := dbutil.ExecAffected(ctx, conn(ctx, r.db), sqlStr, args)
	if err != nil {
		return fmt.Errorf("update: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TodoRepo) GetByID(ctx context.Context, userID, id string) (*model.Todo, error) {
	where := map[string]any{
		"id":      id,
		"user_id": userID,
	}
	sqlStr, args, err := builder.BuildSelect("todos", where, []string{
		"id", "user_id", "content", "due_date", "done", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	row := conn(ctx, r.db).QueryRowContext(ctx, sqlStr, args...)
	var todo model.Todo
	if err := row.Scan(&todo.ID, &todo.UserID, &todo.Content, &todo.DueDate, &todo.Done, &todo.Ctime,
		&todo.Mtime); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, appErr.ErrNotFound
		}
		return nil, fmt.Errorf("query: %w", err)
	}
	return &todo, nil
}

func (r *TodoRepo) ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error) {
	where := map[string]any{
		"user_id":     userID,
		"due_date >=": startDate,
		"due_date <=": endDate,
		"_orderby":    "due_date asc, ctime asc",
	}
	sqlStr, args, err := builder.BuildSelect("todos", where, []string{
		"id", "user_id", "content", "due_date", "done", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()

	items := make([]model.Todo, 0)
	for rows.Next() {
		var item model.Todo
		if err := rows.Scan(&item.ID, &item.UserID, &item.Content, &item.DueDate, &item.Done, &item.Ctime,
			&item.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (r *TodoRepo) Delete(ctx context.Context, userID, id string) error {
	sqlStr, args, err := builder.BuildDelete("todos", map[string]any{
		"id":      id,
		"user_id": userID,
	})
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}
