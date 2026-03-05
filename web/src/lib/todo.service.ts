import { apiFetch } from "@/lib/api";
import type { Todo } from "@/types";

export const todoService = {
    create(docId: string, content: string, dueDate: string, done = false): Promise<Todo> {
        return apiFetch<Todo>("/todos", {
            method: "POST",
            body: JSON.stringify({ document_id: docId, content, due_date: dueDate, done }),
        });
    },

    listByDateRange(start: string, end: string): Promise<Todo[]> {
        return apiFetch<Todo[]>(`/todos?start=${start}&end=${end}`);
    },

    toggleDone(id: string, done: boolean): Promise<void> {
        return apiFetch(`/todos/${id}/done`, {
            method: "PUT",
            body: JSON.stringify({ done }),
        });
    },

    updateContent(id: string, content: string): Promise<Todo> {
        return apiFetch<Todo>(`/todos/${id}`, {
            method: "PUT",
            body: JSON.stringify({ content }),
        });
    },

    delete(id: string): Promise<void> {
        return apiFetch(`/todos/${id}`, { method: "DELETE" });
    },
};
