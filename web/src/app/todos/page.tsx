"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowLeft, CalendarDays, Eye } from "lucide-react";
import { useTodoCalendar } from "./hooks/useTodoCalendar";
import { WEEKDAYS, MAX_PREVIEW_TODOS, monthYearFormatter, dateKey, monthKey, buildMonthCells, isSameDay } from "./utils";
import { DayViewModal, CreateTodoModal, EditTodoModal } from "./components/TodoModals";

export default function TodosPage() {
  const {
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
    createOpen,
    closeCreatePanel,
    selectedDate,
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
  } = useTodoCalendar();

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
        <DayViewModal
          dayViewDate={dayViewDate}
          dayViewTodos={dayViewTodos}
          onClose={closeDayView}
          onToggleDone={handleToggleDone}
          onEdit={openEditPanel}
        />
      )}

      {createOpen && (
        <CreateTodoModal
          selectedDate={selectedDate}
          newTodoContent={newTodoContent}
          setNewTodoContent={setNewTodoContent}
          creating={creating}
          onClose={closeCreatePanel}
          onCreate={handleCreateTodo}
        />
      )}

      {editOpen && (
        <EditTodoModal
          editingTodoDueDate={editingTodoDueDate}
          editTodoContent={editTodoContent}
          setEditTodoContent={setEditTodoContent}
          updating={updating}
          onClose={closeEditPanel}
          onSave={handleUpdateTodoContent}
        />
      )}
    </div>
  );
}
