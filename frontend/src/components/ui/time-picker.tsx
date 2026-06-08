import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TimePickerValue = {
  hour: number;
  minute: number;
  second: number;
};

type TimePickerProps = {
  value?: TimePickerValue;
  onChange: (value: TimePickerValue) => void;
  disabled?: boolean;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const SECONDS = Array.from({ length: 60 }, (_, index) => index);

const pad2 = (value: number) => String(value).padStart(2, "0");

const triggerClassName =
  "h-9 w-auto min-w-[2.75rem] border-0 bg-transparent px-1 shadow-none focus:ring-0 focus:ring-offset-0";

const TimeUnitSelect = ({
  unit,
  value,
  options,
  onChange,
  disabled,
}: {
  unit: "hour" | "minute" | "second";
  value: number;
  options: number[];
  onChange: (value: number) => void;
  disabled?: boolean;
}) => (
  <Select
    value={String(value)}
    onValueChange={(next) => onChange(Number(next))}
    disabled={disabled}
  >
    <SelectTrigger className={triggerClassName} aria-label={unit}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={`${unit}-${option}`} value={String(option)}>
          {pad2(option)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export function TimePicker({ value, onChange, disabled, className }: TimePickerProps) {
  const current: TimePickerValue = value ?? { hour: 0, minute: 0, second: 0 };

  return (
    <div
      className={cn(
        "flex h-9 w-fit items-center gap-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <TimeUnitSelect
        unit="hour"
        value={current.hour}
        options={HOURS}
        disabled={disabled}
        onChange={(hour) => onChange({ ...current, hour })}
      />
      <span className="text-muted-foreground leading-none">:</span>
      <TimeUnitSelect
        unit="minute"
        value={current.minute}
        options={MINUTES}
        disabled={disabled}
        onChange={(minute) => onChange({ ...current, minute })}
      />
      <span className="text-muted-foreground leading-none">:</span>
      <TimeUnitSelect
        unit="second"
        value={current.second}
        options={SECONDS}
        disabled={disabled}
        onChange={(second) => onChange({ ...current, second })}
      />
    </div>
  );
}

export default TimePicker;
