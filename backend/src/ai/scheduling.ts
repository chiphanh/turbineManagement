export type Interval = { startsAt: string; endsAt: string };
export function overlaps(a: Interval, b: Interval) {
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
    Date.parse(b.startsAt) < Date.parse(a.endsAt)
  );
}
export function validateWindow(
  from: string,
  to: string,
  durationMinutes: number,
  now = Date.now()
) {
  const start = Date.parse(from),
    end = Date.parse(to);
  if (
    !/(Z|[+-]\d\d:\d\d)$/.test(from) ||
    !/(Z|[+-]\d\d:\d\d)$/.test(to) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < now ||
    end <= start ||
    end - start > 31 * 86400000 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 30 ||
    durationMinutes > 480
  )
    throw new Error(
      "Use future ISO dates with timezone offsets, a range of at most 31 days, and duration 30–480 minutes."
    );
}
// Work hours use Europe/Berlin across daylight saving transitions.
export function candidateSlots(
  from: string,
  to: string,
  durationMinutes: number
) {
  const slots: Interval[] = [];
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (
    let t = Math.ceil(Date.parse(from) / 1800000) * 1800000;
    t + durationMinutes * 60000 <= Date.parse(to);
    t += 1800000
  ) {
    const parts = Object.fromEntries(
      format.formatToParts(t).map((p) => [p.type, p.value])
    );
    const end = Object.fromEntries(
      format
        .formatToParts(t + durationMinutes * 60000)
        .map((p) => [p.type, p.value])
    );
    if (
      !["Sat", "Sun"].includes(parts.weekday) &&
      Number(parts.hour) >= 9 &&
      Number(end.hour) * 60 + Number(end.minute) <= 17 * 60 &&
      end.weekday === parts.weekday
    )
      slots.push({
        startsAt: new Date(t).toISOString(),
        endsAt: new Date(t + durationMinutes * 60000).toISOString(),
      });
  }
  return slots;
}
