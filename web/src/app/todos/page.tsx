"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useTodoCalendar } from "./hooks/useTodoCalendar";
import { WEEKDAYS, monthYearFormatter, monthKey, buildMonthCells } from "./utils";
import { DayViewModal, CreateTodoModal, EditTodoModal } from "./components/TodoModals";
import { CalendarCell } from "./components/CalendarCell";

export default function TodosPage() {
  const {
    router, months, visibleMonth, loading, todosByDate, dayViewTodos, calendarRef,
    handleCalendarScroll, handleToggleDone, openCreatePanel, openDayView, openEditPanel,
    createOpen, closeCreatePanel, selectedDate, newTodoContent, setNewTodoContent,
    creating, handleCreateTodo, editOpen, closeEditPanel, editingTodoDueDate,
    editTodoContent, setEditTodoContent, updating, handleUpdateTodoContent,
    dayViewOpen, dayViewDate, closeDayView,
  } = useTodoCalendar();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <style jsx global>{`
        @keyframes todo-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-55%); } }
      `}</style>
      <header className="sticky top-0 z-50 h-14 border-b border-border bg-card/95 backdrop-blur flex items-center px-4 gap-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="font-mono font-bold text-lg flex items-center gap-2"><CalendarDays className="h-5 w-5 text-indigo-500" />Tasks & Calendar</h1>
        </div>
        <div className="text-xs text-muted-foreground hidden sm:block">{monthYearFormatter.format(visibleMonth)}</div>
      </header>
      <main className="flex-1 min-h-0 p-4 md:p-6 lg:p-8 bg-muted/20">
        <div className="max-w-6xl mx-auto h-full border border-border rounded-xl overflow-hidden bg-card shadow-sm flex flex-col">
          {loading && <div className="border-b border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">Loading todos...</div>}
          <div ref={calendarRef} onScroll={handleCalendarScroll} className="flex-1 overflow-y-auto overscroll-contain">
            {months.map((month, monthIndex) => {
              const cells = buildMonthCells(month);
              return (
                <section key={monthKey(month)} data-month-index={monthIndex} data-month-key={monthKey(month)} className="border-b border-border/50 last:border-b-0">
                  <div className="px-3 py-2 border-b border-border/40 bg-muted/10 text-xs font-semibold tracking-wide text-muted-foreground">{monthYearFormatter.format(month)}</div>
                  <div className="grid grid-cols-7 border-b border-border/40 bg-muted/40">
                    {WEEKDAYS.map((day) => (
                      <div key={`${monthKey(month)}-${day}`} className="py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 auto-rows-[188px]">
                    {cells.map((day, dayIndex) => (
                      <CalendarCell key={`${monthKey(month)}-cell-${dayIndex}`} day={day} dayIndex={dayIndex} month={month}
                        todosByDate={todosByDate} onCreatePanel={openCreatePanel} onDayView={openDayView}
                        onToggleDone={handleToggleDone} onEditPanel={openEditPanel} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>
      {dayViewOpen && <DayViewModal dayViewDate={dayViewDate} dayViewTodos={dayViewTodos} onClose={closeDayView} onToggleDone={handleToggleDone} onEdit={openEditPanel} />}
      {createOpen && <CreateTodoModal selectedDate={selectedDate} newTodoContent={newTodoContent} setNewTodoContent={setNewTodoContent} creating={creating} onClose={closeCreatePanel} onCreate={handleCreateTodo} />}
      {editOpen && <EditTodoModal editingTodoDueDate={editingTodoDueDate} editTodoContent={editTodoContent} setEditTodoContent={setEditTodoContent} updating={updating} onClose={closeEditPanel} onSave={handleUpdateTodoContent} />}
    </div>
  );
}
