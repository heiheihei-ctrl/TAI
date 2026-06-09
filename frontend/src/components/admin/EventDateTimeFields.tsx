import { useLayoutEffect, useRef, useState } from "react";
import { CardDescription } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { TimePicker, type TimePickerValue } from "@/components/ui/time-picker";
import {
  mergeEventDateAndTime,
  todayDateValue,
  toEventDateValue,
  toLocalDateValueFromDate,
  toEventTimeValue,
} from "@/services/adminApi";

type EventDateTimeFieldsProps = {
  title: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
};

const parseEventDate = (iso?: string): Date | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const parseEventTime = (iso?: string): TimePickerValue | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
};

const formatTimeValue = (value: TimePickerValue): string =>
  `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}:${String(value.second).padStart(2, "0")}`;

export function EventDateTimeFields({
  title,
  value,
  onChange,
  disabled,
  description,
}: EventDateTimeFieldsProps) {
  const timeFieldRef = useRef<HTMLDivElement>(null);
  const [controlWidth, setControlWidth] = useState<number>();
  const selectedDate = parseEventDate(value);
  const selectedTime = parseEventTime(value);

  useLayoutEffect(() => {
    const node = timeFieldRef.current;
    if (!node) return;

    const updateWidth = () => {
      setControlWidth(node.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedTime, disabled]);

  return (
    <div className="space-y-3">
      <Label>{title}</Label>
      <div className="flex flex-wrap items-end gap-4">
        <div
          className="space-y-2"
          style={controlWidth ? { width: controlWidth } : undefined}
        >
          <Label className="text-muted-foreground">日期</Label>
          <DatePicker
            value={selectedDate}
            disabled={disabled}
            placeholder="选择日期"
            className="w-full"
            onChange={(date) => {
              if (!date) {
                onChange("");
                return;
              }
              const timeValue = toEventTimeValue(value) || "00:00:00";
              onChange(mergeEventDateAndTime(toLocalDateValueFromDate(date), timeValue));
            }}
          />
        </div>
        <div ref={timeFieldRef} className="w-fit space-y-2">
          <Label className="text-muted-foreground">时间</Label>
          <TimePicker
            value={selectedTime}
            disabled={disabled || !selectedDate}
            onChange={(time) => {
              const dateValue = toEventDateValue(value) || todayDateValue();
              onChange(mergeEventDateAndTime(dateValue, formatTimeValue(time)));
            }}
          />
        </div>
      </div>
      {description ? (
        <CardDescription className="pt-0">{description}</CardDescription>
      ) : null}
    </div>
  );
}

export default EventDateTimeFields;
