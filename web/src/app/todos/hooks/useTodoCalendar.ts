"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/api";
import { todoService } from "@/lib/todo.service";
import { Todo } from "@/types";
import { useToast } from "@/components/ui/toast";
import type { PendingAdjust } from "../types";
import {
  EXPAND_BATCH,
  EDGE_THRESHOLD,
  dateKey,
  monthKey,
  startOfMonth,
  endOfMonth,
  shiftMonth,
  isSameMonth,
  buildInitialMonths,
} from "../utils";

export function useTodoCalendar() {
  const router = useRouter();
  const { toast } = useToast();

  const todayMonth = startOfMonth(new Date());
  const [months, setMonths] = useState<Date[]>(() => buildInitialMonths(todayMonth));
  const [visibleMonth, setVisibleMonth] = useState(todayMonth);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

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

  const calendarRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const pendingAdjustRef = useRef<PendingAdjust>(null);
  const loadingMoreRef = useRef(false);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  useEffect(() => {
    if (!firstMonth || !lastMonth) {
      setTodos([]);
      return;
    }

    const start = startOfMonth(firstMonth);
    const end = endOfMonth(lastMonth);
    const seq = fetchSeqRef.current + 1;
    fetchSeqRef.current = seq;

    setLoading(true);

    (async () => {
      try {
        const res = await todoService.listByDateRange(dateKey(start), dateKey(end));
        if (fetchSeqRef.current !== seq) return;
        setTodos(res || []);
      } catch {
        if (fetchSeqRef.current !== seq) return;
        toast({ title: "Load Failed", description: "Failed to load todos.", variant: "error" });
      } finally {
        if (fetchSeqRef.current === seq) setLoading(false);
      }
    })();
  }, [firstMonth, lastMonth, toast]);

  useLayoutEffect(() => {
    const container = calendarRef.current;
    if (!container) return;

    if (!initializedRef.current) {
      const targetKey = monthKey(todayMonth);
      const target = container.querySelector<HTMLElement>(`[data-month-key="${targetKey}"]`);
      if (target) {
        container.scrollTop = target.offsetTop;
      }
      initializedRef.current = true;
      return;
    }

    const pending = pendingAdjustRef.current;
    if (!pending) return;

    if (pending.type === "prepend") {
      const addedHeight = container.scrollHeight - pending.prevHeight;
      container.scrollTop = pending.prevTop + addedHeight;
    }

    pendingAdjustRef.current = null;
    loadingMoreRef.current = false;
  }, [months, todayMonth]);

  const todosByDate = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const todo of todos) {
      if (!todo.due_date) continue;
      if (!map[todo.due_date]) map[todo.due_date] = [];
      map[todo.due_date].push(todo);
    }
    return map;
  }, [todos]);

  const dayViewTodos = useMemo(() => {
    if (!dayViewDate) return [] as Todo[];
    return todosByDate[dayViewDate] || [];
  }, [dayViewDate, todosByDate]);

  const handleToggleDone = useCallback(async (todo: Todo) => {
    try {
      const nextDone = todo.done === 1 ? 0 : 1;
      setTodos((prev) => prev.map((item) => (item.id === todo.id ? { ...item, done: nextDone } : item)));
      await todoService.toggleDone(todo.id, nextDone === 1);
    } catch {
      toast({ title: "Update Failed", description: "Failed to toggle todo state.", variant: "error" });
      const rangeStart = firstMonth ? startOfMonth(firstMonth) : startOfMonth(todayMonth);
      const rangeEnd = lastMonth ? endOfMonth(lastMonth) : endOfMonth(todayMonth);
      const res = await todoService.listByDateRange(dateKey(rangeStart), dateKey(rangeEnd)).catch(() => [] as Todo[]);
      setTodos(res || []);
    }
  }, [firstMonth, lastMonth, toast, todayMonth]);

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
    const content = newTodoContent.trim();
    if (!content) {
      toast({ title: "Invalid Todo", description: "Please enter todo content.", variant: "error" });
      return;
    }
    if (!selectedDate) {
      toast({ title: "Missing Date", description: "Please pick a date.", variant: "error" });
      return;
    }
    setCreating(true);
    try {
      await todoService.create(content, selectedDate, false);
      if (firstMonth && lastMonth) {
        const res = await todoService.listByDateRange(dateKey(startOfMonth(firstMonth)), dateKey(endOfMonth(lastMonth)));
        setTodos(res || []);
      }
      closeCreatePanel();
      toast({ title: "Todo Created", description: "Todo added to calendar.", variant: "success" });
    } catch {
      toast({ title: "Create Failed", description: "Failed to create todo.", variant: "error" });
    } finally {
      setCreating(false);
    }
  }, [closeCreatePanel, firstMonth, lastMonth, newTodoContent, selectedDate, toast]);

  const handleUpdateTodoContent = useCallback(async () => {
    const nextContent = editTodoContent.trim();
    if (!editingTodoID) return;
    if (!nextContent) {
      toast({ title: "Invalid Todo", description: "Please enter todo content.", variant: "error" });
      return;
    }
    setUpdating(true);
    try {
      const updated = await todoService.updateContent(editingTodoID, nextContent);
      setTodos((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? { ...item, content: updated.content, mtime: updated.mtime }
            : item
        )
      );
      closeEditPanel();
      toast({ title: "Todo Updated", description: "Todo content has been updated.", variant: "success" });
    } catch {
      toast({ title: "Update Failed", description: "Failed to update todo content.", variant: "error" });
    } finally {
      setUpdating(false);
    }
  }, [closeEditPanel, editTodoContent, editingTodoID, toast]);

  useEffect(() => {
    if (!createOpen && !editOpen && !dayViewOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (dayViewOpen) { closeDayView(); return; }
        if (editOpen) { closeEditPanel(); return; }
        closeCreatePanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeCreatePanel, closeDayView, closeEditPanel, createOpen, dayViewOpen, editOpen]);

  const handleCalendarScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-month-index]"));
    if (sections.length === 0) return;

    const viewportCenter = container.scrollTop + container.clientHeight / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const section of sections) {
      const idx = Number(section.dataset.monthIndex || "0");
      const center = section.offsetTop + section.offsetHeight / 2;
      const distance = Math.abs(center - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = idx;
      }
    }

    const currentVisible = months[nearestIndex];
    if (currentVisible && !isSameMonth(currentVisible, visibleMonth)) {
      setVisibleMonth(currentVisible);
    }

    if (loadingMoreRef.current || months.length === 0) return;

    if (container.scrollTop < EDGE_THRESHOLD) {
      loadingMoreRef.current = true;
      pendingAdjustRef.current = {
        type: "prepend",
        prevTop: container.scrollTop,
        prevHeight: container.scrollHeight,
      };
      setMonths((prev) => {
        const first = prev[0];
        if (!first) return prev;
        const add: Date[] = [];
        for (let i = EXPAND_BATCH; i >= 1; i -= 1) {
          add.push(shiftMonth(first, -i));
        }
        return [...add, ...prev];
      });
      return;
    }

    if (container.scrollTop + container.clientHeight > container.scrollHeight - EDGE_THRESHOLD) {
      loadingMoreRef.current = true;
      pendingAdjustRef.current = { type: "append" };
      setMonths((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return prev;
        const add: Date[] = [];
        for (let i = 1; i <= EXPAND_BATCH; i += 1) {
          add.push(shiftMonth(last, i));
        }
        return [...prev, ...add];
      });
    }
  }, [months, visibleMonth]);

  return {
    router,
    months,
    visibleMonth,
    loading,
    todosByDate,
    dayViewTodos,
    calendarRef,
    handleCalendarScroll,
    handleToggleDone,
    openCreatePanel,
    openDayView,
    openEditPanel,
    // Create modal
    createOpen,
    closeCreatePanel,
    selectedDate,
    newTodoContent,
    setNewTodoContent,
    creating,
    handleCreateTodo,
    // Edit modal
    editOpen,
    closeEditPanel,
    editingTodoDueDate,
    editTodoContent,
    setEditTodoContent,
    updating,
    handleUpdateTodoContent,
    // Day view
    dayViewOpen,
    dayViewDate,
    closeDayView,
  };
}
