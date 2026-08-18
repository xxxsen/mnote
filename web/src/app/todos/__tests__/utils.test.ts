import { describe, expect, it } from "vitest";

import type { Todo } from "@/types";

import { sortTodosByCompletion } from "../utils";

const makeTodo = (id: string, done: number): Todo => ({
  id,
  user_id: "user-1",
  content: id,
  due_date: "2025-01-15",
  done,
  ctime: 0,
  mtime: 0,
});

describe("sortTodosByCompletion", () => {
  it("puts unfinished todos first while preserving group order and input", () => {
    const todos = [
      makeTodo("done-1", 1),
      makeTodo("open-1", 0),
      makeTodo("done-2", 1),
      makeTodo("open-2", 0),
    ];

    expect(sortTodosByCompletion(todos).map((todo) => todo.id))
      .toEqual(["open-1", "open-2", "done-1", "done-2"]);
    expect(todos.map((todo) => todo.id))
      .toEqual(["done-1", "open-1", "done-2", "open-2"]);
  });
});
