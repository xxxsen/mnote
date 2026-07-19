"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction, UIEvent } from "react";

import { useToast } from "@/components/ui/toast";
import { todoService } from "@/lib/todo.service";
import type { Todo } from "@/types";

import type { PendingAdjust } from "../types";
import {
  EDGE_THRESHOLD,
  EXPAND_BATCH,
  buildInitialMonths,
  dateKey,
  endOfMonth,
  isSameMonth,
  monthKey,
  shiftMonth,
  startOfMonth,
} from "../utils";

function useTodoFetch(months: Date[]) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const fetchSeqRef = useRef(0);
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  useEffect(() => {
    const start = startOfMonth(firstMonth);
    const end = endOfMonth(lastMonth);
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setLoadError(false);

    void (async () => {
      try {
        const result = await todoService.listByDateRange(dateKey(start), dateKey(end));
        /* v8 ignore next -- stale request guard */
        if (fetchSeqRef.current !== seq) return;
        setTodos(result);
      } catch {
        /* v8 ignore next -- stale request guard */
        if (fetchSeqRef.current !== seq) return;
        setLoadError(true);
      } finally {
        /* v8 ignore next -- stale request guard */
        if (fetchSeqRef.current === seq) setLoading(false);
      }
    })();
  }, [firstMonth, lastMonth, retryVersion]);

  const retryTodos = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  return {
    todos,
    setTodos,
    loading,
    loadError,
    retryTodos,
  };
}

function groupTodosByDate(todos: Todo[]) {
  const grouped = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (!todo.due_date) continue;
    const existing = grouped.get(todo.due_date);
    if (existing) existing.push(todo);
    else grouped.set(todo.due_date, [todo]);
  }
  return grouped;
}

function useTodoDeletion(
  setTodos: Dispatch<SetStateAction<Todo[]>>,
  toast: ReturnType<typeof useToast>["toast"],
) {
  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const requestDeleteTodo = useCallback((todo: Todo) => setDeleteTarget(todo), []);
  const cancelDeleteTodo = useCallback(() => {
    if (!deletingRef.current) setDeleteTarget(null);
  }, []);
  const confirmDeleteTodo = useCallback(async () => {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await todoService.delete(deleteTarget.id);
      setTodos((previous) => previous.filter((todo) => todo.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "Todo deleted", description: "Todo removed from the calendar.", variant: "success" });
    } catch {
      toast({ title: "Delete failed", description: "Failed to delete todo.", variant: "error" });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [deleteTarget, setTodos, toast]);

  return {
    deleteTarget,
    deleting,
    requestDeleteTodo,
    cancelDeleteTodo,
    confirmDeleteTodo,
  };
}

function useTodoActions(
  setTodos: Dispatch<SetStateAction<Todo[]>>,
  toast: ReturnType<typeof useToast>["toast"],
) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [newTodoContent, setNewTodoContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTodoID, setEditingTodoID] = useState("");
  const [editingTodoDueDate, setEditingTodoDueDate] = useState("");
  const [editTodoContent, setEditTodoContent] = useState("");
  const [updating, setUpdating] = useState(false);
  const [dayViewOpen, setDayViewOpen] = useState(false);
  const [dayViewDate, setDayViewDate] = useState("");
  const [pendingToggleIDs, setPendingToggleIDs] = useState<ReadonlySet<string>>(() => new Set());
  const creatingRef = useRef(false);
  const updatingRef = useRef(false);
  const pendingToggleIDsRef = useRef(new Set<string>());
  const deletion = useTodoDeletion(setTodos, toast);

  const handleToggleDone = useCallback(async (todo: Todo) => {
    if (pendingToggleIDsRef.current.has(todo.id)) return;
    const previousDone = todo.done;
    const nextDone = previousDone === 1 ? 0 : 1;
    pendingToggleIDsRef.current.add(todo.id);
    setPendingToggleIDs(new Set(pendingToggleIDsRef.current));
    setTodos((previous) => previous.map((item) => (
      item.id === todo.id ? { ...item, done: nextDone } : item
    )));

    try {
      await todoService.toggleDone(todo.id, nextDone === 1);
    } catch {
      setTodos((previous) => previous.map((item) => (
        item.id === todo.id ? { ...item, done: previousDone } : item
      )));
      toast({ title: "Update failed", description: "The todo state was restored.", variant: "error" });
    } finally {
      pendingToggleIDsRef.current.delete(todo.id);
      setPendingToggleIDs(new Set(pendingToggleIDsRef.current));
    }
  }, [setTodos, toast]);

  const closeCreatePanel = useCallback(() => {
    setCreateOpen(false);
    setCreating(false);
  }, []);
  const openCreatePanel = useCallback((day: Date) => {
    setSelectedDate(dateKey(day));
    setNewTodoContent("");
    setCreateOpen(true);
  }, []);
  const closeEditPanel = useCallback(() => {
    setEditOpen(false);
    setEditingTodoID("");
    setEditingTodoDueDate("");
    setEditTodoContent("");
    setUpdating(false);
  }, []);
  const closeDayView = useCallback(() => {
    setDayViewOpen(false);
    setDayViewDate("");
  }, []);
  const openDayView = useCallback((date: string) => {
    setDayViewDate(date);
    setDayViewOpen(true);
  }, []);
  const openEditPanel = useCallback((todo: Todo) => {
    setEditingTodoID(todo.id);
    setEditingTodoDueDate(todo.due_date);
    setEditTodoContent(todo.content);
    setEditOpen(true);
  }, []);

  const handleCreateTodo = useCallback(async () => {
    if (creatingRef.current) return;
    const content = newTodoContent.trim();
    if (!content) {
      toast({ title: "Invalid todo", description: "Please enter todo content.", variant: "error" });
      return;
    }
    if (!selectedDate) {
      toast({ title: "Missing date", description: "Please pick a date.", variant: "error" });
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    try {
      const created = await todoService.create(content, selectedDate, false);
      setTodos((previous) => [...previous, created]);
      closeCreatePanel();
      toast({ title: "Todo created", description: "Todo added to the calendar.", variant: "success" });
    } catch {
      toast({ title: "Create failed", description: "Failed to create todo.", variant: "error" });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [closeCreatePanel, newTodoContent, selectedDate, setTodos, toast]);

  const handleUpdateTodoContent = useCallback(async () => {
    if (updatingRef.current) return;
    const nextContent = editTodoContent.trim();
    if (!editingTodoID) return;
    if (!nextContent) {
      toast({ title: "Invalid todo", description: "Please enter todo content.", variant: "error" });
      return;
    }
    updatingRef.current = true;
    setUpdating(true);
    try {
      const updated = await todoService.updateContent(editingTodoID, nextContent);
      setTodos((previous) => previous.map((item) => (
        item.id === updated.id
          ? { ...item, content: updated.content, mtime: updated.mtime }
          : item
      )));
      closeEditPanel();
      toast({ title: "Todo updated", description: "Todo content has been updated.", variant: "success" });
    } catch {
      toast({ title: "Update failed", description: "Failed to update todo content.", variant: "error" });
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  }, [closeEditPanel, editTodoContent, editingTodoID, setTodos, toast]);

  return {
    handleToggleDone,
    pendingToggleIDs,
    openCreatePanel,
    openDayView,
    openEditPanel,
    createOpen,
    closeCreatePanel,
    selectedDate,
    setSelectedDate,
    newTodoContent,
    setNewTodoContent,
    creating,
    handleCreateTodo,
    editOpen,
    closeEditPanel,
    editingTodoDueDate,
    editTodoContent,
    setEditTodoContent,
    updating,
    handleUpdateTodoContent,
    dayViewOpen,
    dayViewDate,
    closeDayView,
    ...deletion,
  };
}

export function useTodoCalendar() {
  const { toast } = useToast();
  const [todayMonth] = useState(() => startOfMonth(new Date()));
  const [months, setMonths] = useState<Date[]>(() => buildInitialMonths(todayMonth));
  const [visibleMonth, setVisibleMonth] = useState(todayMonth);
  const {
    todos,
    setTodos,
    loading,
    loadError,
    retryTodos,
  } = useTodoFetch(months);
  const actions = useTodoActions(setTodos, toast);

  const calendarRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const requestedMonthRef = useRef<Date>(todayMonth);
  const pendingAdjustRef = useRef<PendingAdjust>(null);
  const loadingMoreRef = useRef(false);

  /* v8 ignore start -- layout scroll adjustment requires a real DOM viewport */
  useLayoutEffect(() => {
    const container = calendarRef.current;
    if (!container) return;
    if (!initializedRef.current) {
      const requestedMonth = requestedMonthRef.current;
      const target = container.querySelector<HTMLElement>(
        `[data-month-key="${monthKey(requestedMonth)}"]`,
      );
      if (target) {
        container.scrollTop = target.offsetTop;
        setVisibleMonth(requestedMonth);
      }
      initializedRef.current = true;
      return;
    }
    const pending = pendingAdjustRef.current;
    if (!pending) return;
    if (pending.type === "prepend") {
      container.scrollTop = pending.prevTop + (container.scrollHeight - pending.prevHeight);
    }
    pendingAdjustRef.current = null;
    loadingMoreRef.current = false;
  }, [months]);
  /* v8 ignore stop */

  const todosByDate = useMemo(() => groupTodosByDate(todos), [todos]);
  const getTodosForDate = useCallback(
    (key: string) => todosByDate.get(key) ?? [],
    [todosByDate],
  );
  const dayViewTodos = useMemo(
    () => actions.dayViewDate ? getTodosForDate(actions.dayViewDate) : [],
    [actions.dayViewDate, getTodosForDate],
  );

  const navigateToMonth = useCallback((target: Date) => {
    const normalizedTarget = startOfMonth(target);
    requestedMonthRef.current = normalizedTarget;
    setVisibleMonth(normalizedTarget);

    const container = calendarRef.current;
    const targetSection = container?.querySelector<HTMLElement>(
      `[data-month-key="${monthKey(normalizedTarget)}"]`,
    );
    if (container && targetSection) {
      container.scrollTop = targetSection.offsetTop;
      return;
    }

    initializedRef.current = false;
    loadingMoreRef.current = false;
    pendingAdjustRef.current = null;
    setMonths(buildInitialMonths(normalizedTarget));
  }, []);

  const showPreviousMonth = useCallback(
    () => navigateToMonth(shiftMonth(visibleMonth, -1)),
    [navigateToMonth, visibleMonth],
  );
  const showNextMonth = useCallback(
    () => navigateToMonth(shiftMonth(visibleMonth, 1)),
    [navigateToMonth, visibleMonth],
  );
  const showToday = useCallback(
    () => navigateToMonth(todayMonth),
    [navigateToMonth, todayMonth],
  );

  /* v8 ignore start -- scroll pagination and nearest-section detection require a real DOM viewport */
  const handleCalendarScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-month-index]"));
    if (sections.length === 0) return;
    const viewportCenter = container.scrollTop + container.clientHeight / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const section of sections) {
      const index = Number(section.dataset.monthIndex || "0");
      const distance = Math.abs(section.offsetTop + section.offsetHeight / 2 - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    const currentVisible = months[nearestIndex];
    if (!isSameMonth(currentVisible, visibleMonth)) setVisibleMonth(currentVisible);
    if (loadingMoreRef.current || months.length === 0) return;
    if (container.scrollTop < EDGE_THRESHOLD) {
      loadingMoreRef.current = true;
      pendingAdjustRef.current = {
        type: "prepend",
        prevTop: container.scrollTop,
        prevHeight: container.scrollHeight,
      };
      setMonths((previous) => {
        const additional: Date[] = [];
        for (let index = EXPAND_BATCH; index >= 1; index -= 1) {
          additional.push(shiftMonth(previous[0], -index));
        }
        return [...additional, ...previous];
      });
      return;
    }
    if (container.scrollTop + container.clientHeight > container.scrollHeight - EDGE_THRESHOLD) {
      loadingMoreRef.current = true;
      pendingAdjustRef.current = { type: "append" };
      setMonths((previous) => {
        const additional: Date[] = [];
        for (let index = 1; index <= EXPAND_BATCH; index += 1) {
          additional.push(shiftMonth(previous[previous.length - 1], index));
        }
        return [...previous, ...additional];
      });
    }
  }, [months, visibleMonth]);
  /* v8 ignore stop */

  return {
    months,
    visibleMonth,
    loading,
    loadError,
    retryTodos,
    todosByDate: getTodosForDate,
    dayViewTodos,
    calendarRef,
    handleCalendarScroll,
    showPreviousMonth,
    showNextMonth,
    showToday,
    ...actions,
  };
}
