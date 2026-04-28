export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const INITIAL_MONTH_RADIUS = 2;
export const EXPAND_BATCH = 2;
export const EDGE_THRESHOLD = 280;
export const MAX_PREVIEW_TODOS = 4;
export const monthYearFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function buildInitialMonths(center: Date): Date[] {
  return Array.from(
    { length: INITIAL_MONTH_RADIUS * 2 + 1 },
    (_, idx) => shiftMonth(center, idx - INITIAL_MONTH_RADIUS)
  );
}

export function buildMonthCells(month: Date): Array<Date | null> {
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
