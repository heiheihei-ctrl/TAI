import React from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const selectClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseBirthday(value: string | null | undefined): {
  year: string;
  month: string;
  day: string;
} {
  const trimmed = (value || "").trim();
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!matched) {
    return { year: "", month: "", day: "" };
  }
  return { year: matched[1], month: matched[2], day: matched[3] };
}

function buildBirthday(year: string, month: string, day: string): string {
  if (!year || !month || !day) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export default function BirthdayPicker({ value, onChange, className }: Props) {
  const parsed = React.useMemo(() => parseBirthday(value), [value]);
  const [year, setYear] = React.useState(parsed.year);
  const [month, setMonth] = React.useState(parsed.month);
  const [day, setDay] = React.useState(parsed.day);

  React.useEffect(() => {
    setYear(parsed.year);
    setMonth(parsed.month);
    setDay(parsed.day);
  }, [parsed.year, parsed.month, parsed.day]);

  const currentYear = new Date().getFullYear();
  const years = React.useMemo(
    () => Array.from({ length: 121 }, (_, index) => String(currentYear - index)),
    [currentYear],
  );
  const months = React.useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")),
    [],
  );
  const days = React.useMemo(() => {
    const yearNumber = Number.parseInt(year, 10);
    const monthNumber = Number.parseInt(month, 10);
    if (!year || !month || !Number.isFinite(yearNumber) || !Number.isFinite(monthNumber)) {
      return Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
    }
    const total = getDaysInMonth(yearNumber, monthNumber);
    return Array.from({ length: total }, (_, index) => String(index + 1).padStart(2, "0"));
  }, [year, month]);

  React.useEffect(() => {
    if (!day) return;
    if (!days.includes(day)) {
      setDay("");
      onChange(buildBirthday(year, month, ""));
    }
  }, [day, days, month, onChange, year]);

  const update = (nextYear: string, nextMonth: string, nextDay: string) => {
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);
    onChange(buildBirthday(nextYear, nextMonth, nextDay));
  };

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-3">
        <select
          className={selectClassName}
          value={year}
          onChange={(event) => update(event.target.value, month, day)}
        >
          <option value="">年</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item} 年
            </option>
          ))}
        </select>
        <select
          className={selectClassName}
          value={month}
          onChange={(event) => update(year, event.target.value, day)}
        >
          <option value="">月</option>
          {months.map((item) => (
            <option key={item} value={item}>
              {Number.parseInt(item, 10)} 月
            </option>
          ))}
        </select>
        <select
          className={selectClassName}
          value={day}
          onChange={(event) => update(year, month, event.target.value)}
        >
          <option value="">日</option>
          {days.map((item) => (
            <option key={item} value={item}>
              {Number.parseInt(item, 10)} 日
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function formatBirthdayLabel(value: string | null | undefined): string {
  const parsed = parseBirthday(value);
  if (!parsed.year || !parsed.month || !parsed.day) return "-";
  return `${parsed.year} 年 ${Number.parseInt(parsed.month, 10)} 月 ${Number.parseInt(parsed.day, 10)} 日`;
}
