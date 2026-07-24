export type CalendarCell = number | null;

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

export function getCalendarRows(year: number, month: number): CalendarCell[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const rows: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }
  return rows;
}

export function isCalendarDayInPast(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): boolean {
  const candidate = new Date(year, month, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return candidate.getTime() < today.getTime();
}

export function isCalendarDayBefore(
  year: number,
  month: number,
  day: number,
  minimum: Date,
): boolean {
  const candidate = new Date(year, month, day);
  const minimumDay = new Date(
    minimum.getFullYear(),
    minimum.getMonth(),
    minimum.getDate(),
  );
  return candidate.getTime() < minimumDay.getTime();
}

export function createLocalDateTime(parts: CalendarDateParts): Date {
  validateDateParts(parts);
  const { year, month, day, hour, minute } = parts;
  return new Date(year, month, day, hour, minute, 0, 0);
}

export function formatLocalDateTime(parts: CalendarDateParts): string {
  validateDateParts(parts);
  const { year, month, day, hour, minute } = parts;

  return `${year}-${pad2(month + 1)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

function validateDateParts({ year, month, day, hour, minute }: CalendarDateParts): void {
  if (month < 0 || month > 11) throw new RangeError("month must be between 0 and 11");
  if (day < 1 || day > new Date(year, month + 1, 0).getDate()) {
    throw new RangeError("day is outside the selected month");
  }
  if (hour < 0 || hour > 23) throw new RangeError("hour must be between 0 and 23");
  if (minute < 0 || minute > 59) throw new RangeError("minute must be between 0 and 59");
}
