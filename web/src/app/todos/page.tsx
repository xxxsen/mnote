"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { AppPage } from "@/components/app-page";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageState } from "@/components/ui/page-state";

import { CalendarCell } from "./components/CalendarCell";
import { DeleteTodoDialog } from "./components/DeleteTodoDialog";
import { MobileSchedule } from "./components/MobileSchedule";
import { CreateTodoModal, DayViewModal, EditTodoModal } from "./components/TodoModals";
import { useTodoCalendar } from "./hooks/useTodoCalendar";
import { WEEKDAYS, buildMonthCells, monthKey, monthYearFormatter } from "./utils";

export default function TodosPage() {
  const {
    months,
    visibleMonth,
    loading,
    loadError,
    retryTodos,
    todosByDate,
    dayViewTodos,
    calendarRef,
    handleCalendarScroll,
    handleToggleDone,
    pendingToggleIDs,
    openCreatePanel,
    openDayView,
    openEditPanel,
    showPreviousMonth,
    showNextMonth,
    showToday,
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
    deleteTarget,
    deleting,
    requestDeleteTodo,
    cancelDeleteTodo,
    confirmDeleteTodo,
  } = useTodoCalendar();

  const monthControls = (
    <>
      <IconButton label="Previous month" variant="outline" onClick={showPreviousMonth}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </IconButton>
      <Button type="button" variant="outline" className="px-3" onClick={showToday}>
        Today
      </Button>
      <IconButton label="Next month" variant="outline" onClick={showNextMonth}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </>
  );

  return (
    <AppPage
      title="Tasks"
      description={monthYearFormatter.format(visibleMonth)}
      width="wide"
      secondaryActions={monthControls}
      primaryAction={(
        <Button
          type="button"
          aria-label="New task"
          className="gap-2 px-3 sm:px-4"
          onClick={() => openCreatePanel(new Date())}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">New task</span>
          <span className="sm:hidden">New</span>
        </Button>
      )}
      className="py-4 md:py-6"
    >
      {loadError ? (
        <PageState
          kind="error"
          title="Could not load tasks"
          description="Check your connection and try loading the calendar again."
          actionLabel="Retry"
          onAction={retryTodos}
        />
      ) : loading ? (
        <PageState
          kind="loading"
          title="Loading tasks"
          description="Preparing your calendar and schedule."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-border bg-card md:hidden">
            <MobileSchedule
              month={visibleMonth}
              todosByDate={todosByDate}
              pendingToggleIDs={pendingToggleIDs}
              onCreatePanel={openCreatePanel}
              onDayView={openDayView}
              onToggleDone={handleToggleDone}
              onEditPanel={openEditPanel}
            />
          </div>

          <div className="hidden h-[calc(100dvh-10.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-md border border-border bg-card md:flex">
            <div
              ref={calendarRef}
              onScroll={handleCalendarScroll}
              className="flex-1 overflow-y-auto overscroll-contain"
            >
              {months.map((month, monthIndex) => {
                const cells = buildMonthCells(month);
                return (
                  <section
                    key={monthKey(month)}
                    data-month-index={monthIndex}
                    data-month-key={monthKey(month)}
                    aria-labelledby={`month-${monthKey(month)}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <h2
                      id={`month-${monthKey(month)}`}
                      className="sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-2 text-sm font-semibold backdrop-blur"
                    >
                      {monthYearFormatter.format(month)}
                    </h2>
                    <div className="grid grid-cols-7 border-b border-border bg-muted/50">
                      {WEEKDAYS.map((day) => (
                        <div
                          key={`${monthKey(month)}-${day}`}
                          className="py-2 text-center text-xs font-semibold text-muted-foreground"
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 auto-rows-[188px]">
                      {cells.map((day, dayIndex) => (
                        <CalendarCell
                          key={`${monthKey(month)}-cell-${dayIndex}`}
                          day={day}
                          dayIndex={dayIndex}
                          todosByDate={todosByDate}
                          pendingToggleIDs={pendingToggleIDs}
                          onCreatePanel={openCreatePanel}
                          onDayView={openDayView}
                          onToggleDone={handleToggleDone}
                          onEditPanel={openEditPanel}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

      {dayViewOpen ? (
        <DayViewModal
          dayViewDate={dayViewDate}
          dayViewTodos={dayViewTodos}
          pendingToggleIDs={pendingToggleIDs}
          onClose={closeDayView}
          onToggleDone={handleToggleDone}
          onEdit={openEditPanel}
          onDelete={requestDeleteTodo}
        />
      ) : null}
      {createOpen ? (
        <CreateTodoModal
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          newTodoContent={newTodoContent}
          setNewTodoContent={setNewTodoContent}
          creating={creating}
          onClose={closeCreatePanel}
          onCreate={handleCreateTodo}
        />
      ) : null}
      {editOpen ? (
        <EditTodoModal
          editingTodoDueDate={editingTodoDueDate}
          editTodoContent={editTodoContent}
          setEditTodoContent={setEditTodoContent}
          updating={updating}
          onClose={closeEditPanel}
          onSave={handleUpdateTodoContent}
        />
      ) : null}
      <DeleteTodoDialog
        target={deleteTarget}
        deleting={deleting}
        onCancel={cancelDeleteTodo}
        onConfirm={() => void confirmDeleteTodo()}
      />
    </AppPage>
  );
}
