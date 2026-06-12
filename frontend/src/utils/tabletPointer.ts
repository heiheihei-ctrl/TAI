export type PointerInputKind = "pen" | "mouse" | "touch" | "unknown";

export type PointerSample = {
  clientX: number;
  clientY: number;
  pressure: number;
  pointerType: PointerInputKind;
};

export function getPointerInputKind(
  event: Pick<PointerEvent, "pointerType">,
): PointerInputKind {
  if (event.pointerType === "pen") return "pen";
  if (event.pointerType === "mouse") return "mouse";
  if (event.pointerType === "touch") return "touch";
  return "unknown";
}

export function isPenPointer(event: Pick<PointerEvent, "pointerType">): boolean {
  return event.pointerType === "pen";
}

export function readPointerPressure(
  event: Pick<PointerEvent, "pressure" | "pointerType">,
): number {
  if (event.pointerType === "pen" || event.pointerType === "touch") {
    return event.pressure > 0 ? event.pressure : 0.5;
  }
  return 0.5;
}

export function pressureToStrokeMultiplier(
  pressure: number,
  min = 0.25,
  max = 1,
): number {
  const clamped = Math.min(1, Math.max(0, pressure));
  return min + (max - min) * clamped;
}

export function getCoalescedPointerSamples(event: PointerEvent): PointerSample[] {
  const events =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [event];

  return events.map((sample) => ({
    clientX: sample.clientX,
    clientY: sample.clientY,
    pressure: readPointerPressure(sample),
    pointerType: getPointerInputKind(sample),
  }));
}
