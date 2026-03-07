"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/api";
import { todoService } from "@/lib/todo.service";
import { Todo } from "@/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, Circle, ArrowLeft, CalendarDays, X, Eye } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const INITIAL_MONTH_RADIUS = 2;
const EXPAND_BATCH = 2;
const EDGE_THRESHOLD = 280;
const MAX_PREVIEW_TODOS = 4;
const monthYearFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

type PendingAdjust =
  | { type: "prepend"; prevTop: number; prevHeight: number }
  | { type: "append" }
  | null;

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function buildInitialMonths(center: Date): Date[] {
  return Array.from(
    { length: INITIAL_MONTH_RADIUS * 2 + 1 },
    (_, idx) => shiftMonth(center, idx - INITIAL_MONTH_RADIUS)
  );
}

function buildMonthCells(month: Date): Array<Date | null> {
  const firstDay = startOfMonth(month);
  const leading = mondayBasedWeekday(firstDay);
  const totalDays = endOfMonth(month).getDate();

  const cells: Array<Date | null> = [];

  for (let i = 0; i < leading; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i += 1) {
    cells.push(null);
  }

  return cells;
}

export default function TodosPage() {
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
        if (fetchSeqRef.current !== seq) {
          return;
        }
        setTodos(res || []);
      } catch {
        if (fetchSeqRef.current !== seq) {
          return;
        }
        toast({ title: "Load Failed", description: "Failed to load todos.", variant: "error" });
      } finally {
        if (fetchSeqRef.current === seq) {
          setLoading(false);
        }
      }
    })();
  }, [firstMonth, lastMonth, toast]);

  useLayoutEffect(() => {
    const container = calendarRef.current;
    if (!container) {
      return;
    }

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
    if (!pending) {
      return;
    }

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
      if (!todo.due_date) {
        continue;
      }
      if (!map[todo.due_date]) {
        map[todo.due_date] = [];
      }
      map[todo.due_date].push(todo);
    }
    return map;
  }, [todos]);

  const dayViewTodos = useMemo(() => {
    if (!dayViewDate) {
      return [] as Todo[];
    }
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
    if (!editingTodoID) {
      return;
    }
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
    if (!createOpen && !editOpen && !dayViewOpen) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (dayViewOpen) {
          closeDayView();
          return;
        }
        if (editOpen) {
          closeEditPanel();
          return;
        }
        closeCreatePanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeCreatePanel, closeDayView, closeEditPanel, createOpen, dayViewOpen, editOpen]);

  const handleCalendarScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-month-index]"));
    if (sections.length === 0) {
      return;
    }

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

    if (loadingMoreRef.current || months.length === 0) {
      return;
    }

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <style jsx global>{`
        @keyframes todo-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-55%);
          }
        }
      `}</style>
      <header className="sticky top-0 z-50 h-14 border-b border-border bg-card/95 backdrop-blur flex items-center px-4 gap-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-mono font-bold text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-500" />
            Tasks & Calendar
          </h1>
        </div>

        <div className="text-xs text-muted-foreground hidden sm:block">
          {monthYearFormatter.format(visibleMonth)}
        </div>
      </header>

      <main className="flex-1 min-h-0 p-4 md:p-6 lg:p-8 bg-muted/20">
        <div className="max-w-6xl mx-auto h-full border border-border rounded-xl overflow-hidden bg-card shadow-sm flex flex-col">
          {loading && (
            <div className="border-b border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Loading todos...
            </div>
          )}

          <div ref={calendarRef} onScroll={handleCalendarScroll} className="flex-1 overflow-y-auto overscroll-contain">
            {months.map((month, monthIndex) => {
              const cells = buildMonthCells(month);
              return (
                <section key={monthKey(month)} data-month-index={monthIndex} data-month-key={monthKey(month)} className="border-b border-border/50 last:border-b-0">
                  <div className="px-3 py-2 border-b border-border/40 bg-muted/10 text-xs font-semibold tracking-wide text-muted-foreground">
                    {monthYearFormatter.format(month)}
                  </div>

                  <div className="grid grid-cols-7 border-b border-border/40 bg-muted/40">
                    {WEEKDAYS.map((day) => (
                      <div key={`${monthKey(month)}-${day}`} className="py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 auto-rows-[188px]">
                    {cells.map((day, dayIndex) => {
                      const rightBorderClass = (dayIndex + 1) % 7 === 0 ? "border-r-0" : "border-r";
                      if (!day) {
                        return <div key={`${monthKey(month)}-empty-${dayIndex}`} className={`min-h-[188px] border-b border-border/40 ${rightBorderClass} bg-muted/5`} />;
                      }

                      const key = dateKey(day);
                      const dayTodos = todosByDate[key] || [];
                      const previewTodos = dayTodos.slice(0, MAX_PREVIEW_TODOS);
                      const hiddenCount = Math.max(0, dayTodos.length - previewTodos.length);
                      const isToday = isSameDay(day, new Date());

                      return (
                        <div
                          key={`${monthKey(month)}-${key}`}
                          onClick={() => openCreatePanel(day)}
                          className={`group min-h-[188px] border-b border-border/40 ${rightBorderClass} p-2 flex flex-col gap-2 transition-colors cursor-pointer bg-card hover:bg-muted/10`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-indigo-500 text-white" : "text-foreground"}`}>
                              {day.getDate()}
                            </span>
                            <button
                              onClick={(evt) => {
                                evt.stopPropagation();
                                openDayView(key);
                              }}
                              className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:text-indigo-500 transition-colors"
                              title="View all todos"
                              aria-label="View all todos"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="relative flex-1 overflow-hidden">
                            <div className="space-y-1 pr-0.5">
                              {previewTodos.map((todo) => (
                                <div
                                  key={todo.id}
                                  onClick={(evt) => evt.stopPropagation()}
                                  className={`group/todo text-xs rounded border px-2 py-1.5 flex items-start gap-1.5 transition-colors ${todo.done === 1 ? "bg-muted/50 border-transparent opacity-70" : "bg-background border-border hover:border-indigo-400/60"}`}
                                >
                                  <button
                                    onClick={(evt) => {
                                      evt.stopPropagation();
                                      void handleToggleDone(todo);
                                    }}
                                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-indigo-500 transition-colors"
                                  >
                                    {todo.done === 1 ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                      <Circle className="h-3.5 w-3.5" />
                                    )}
                                  </button>

                                  <button
                                    onClick={(evt) => {
                                      evt.stopPropagation();
                                      openEditPanel(todo);
                                    }}
                                    className={`flex-1 min-w-0 text-left ${todo.done === 1 ? "line-through text-muted-foreground" : "text-foreground"}`}
                                    title={`完整内容: ${todo.content}`}
                                  >
                                    {todo.content.length > 18 ? (
                                      <span className="block overflow-hidden whitespace-nowrap">
                                        <span className="inline-block max-w-none group-hover/todo:animate-[todo-marquee_6s_linear_infinite]">
                                          {todo.content}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="block truncate">{todo.content}</span>
                                    )}
                                  </button>


                                </div>
                              ))}
                            </div>

                            {hiddenCount > 0 && (
                              <div
                                onClick={(evt) => {
                                  evt.stopPropagation();
                                  openDayView(key);
                                }}
                                className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card via-card/80 to-transparent flex items-end justify-center pb-1.5 text-[10px] text-muted-foreground"
                              >
                                <span>{hiddenCount} more todos</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>

      {dayViewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={closeDayView}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Day Todos</div>
                <div className="text-sm font-semibold">{dayViewDate}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={closeDayView}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
              {dayViewTodos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                  No todos for this day
                </div>
              ) : (
                dayViewTodos.map((todo) => (
                  <div
                    key={`day-view-${todo.id}`}
                    className={`group/todo rounded-lg border px-3 py-2 flex items-start gap-2 ${todo.done === 1 ? "bg-muted/40 border-transparent opacity-80" : "bg-background border-border"}`}
                  >
                    <button
                      onClick={() => {
                        void handleToggleDone(todo);
                      }}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-indigo-500 transition-colors"
                    >
                      {todo.done === 1 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      onClick={() => openEditPanel(todo)}
                      className={`flex-1 min-w-0 text-left text-sm ${todo.done === 1 ? "line-through text-muted-foreground" : "text-foreground"}`}
                      title={`完整内容: ${todo.content}`}
                    >
                      {todo.content.length > 26 ? (
                        <span className="block overflow-hidden whitespace-nowrap">
                          <span className="inline-block max-w-none group-hover/todo:animate-[todo-marquee_6s_linear_infinite]">
                            {todo.content}
                          </span>
                        </span>
                      ) : (
                        <span className="block truncate">{todo.content}</span>
                      )}
                    </button>


                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={closeCreatePanel}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">New Todo</div>
                <div className="text-sm font-semibold">{selectedDate}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={closeCreatePanel}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Todo Content</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="What needs to be done?"
                  value={newTodoContent}
                  onChange={(e) => setNewTodoContent(e.target.value)}
                />
                <div className="text-[10px] text-muted-foreground text-right mt-1">{newTodoContent.length}/500</div>
              </div>

              <div className="pt-1 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={closeCreatePanel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateTodo}
                  isLoading={creating}
                  disabled={newTodoContent.trim().length === 0}
                >
                  Add Todo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={closeEditPanel}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Edit Todo</div>
                <div className="text-sm font-semibold">{editingTodoDueDate}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={closeEditPanel}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Todo Content</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Update todo content"
                  value={editTodoContent}
                  onChange={(e) => setEditTodoContent(e.target.value)}
                />
                <div className="text-[10px] text-muted-foreground text-right mt-1">{editTodoContent.length}/500</div>
              </div>

              <div className="pt-1 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={closeEditPanel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpdateTodoContent}
                  isLoading={updating}
                  disabled={editTodoContent.trim().length === 0}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
