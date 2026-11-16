"use client";
import { useEffect, useState } from "react";
type Slot = {
  team_id: string;
  team_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
type Booking = {
  id: string;
  teamId: string;
  startsAt: string;
  endsAt: string;
  status: string;
};
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
});
export default function TeamTimeline({ slot }: { slot: Slot }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setBookings(null);
    setFailed(false);
    fetch(
      (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").replace(
        /\/$/,
        ""
      ) + "/bookings",
      { cache: "no-store", signal: c.signal }
    )
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((rows) => {
        if (!c.signal.aborted) setBookings(rows);
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(true);
      });
    return () => c.abort();
  }, [slot.team_id, slot.starts_at]);
  const hour = 3600000,
    start = Date.parse(slot.starts_at),
    end = Date.parse(slot.ends_at);
  if (
    slot.status !== "pending" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  )
    return null;
  const from = Math.floor(start / hour) * hour - hour,
    to = Math.ceil(end / hour) * hour + hour;
  const ticks = Array.from(
    { length: Math.min(8, Math.ceil((to - from) / hour)) },
    (_, i) => from + i * Math.ceil((to - from) / hour / 8) * hour
  );
  const pct = (t: number) => (100 * (t - from)) / (to - from);
  const marks = (bookings ?? []).filter(
    (b) =>
      b.teamId === slot.team_id &&
      b.status === "scheduled" &&
      Date.parse(b.startsAt) < to &&
      Date.parse(b.endsAt) > from
  );
  const block = (s: number, e: number) => ({
    left: pct(Math.max(s, from)) + "%",
    width: pct(Math.min(e, to)) - pct(Math.max(s, from)) + "%",
  });
  return (
    <section className="ao-timeline" aria-label="Team schedule">
      <header>
        <strong>Team schedule</strong>
        <small>{day.format(start)} · Berlin time</small>
      </header>
      <div className="ao-timeline-team">{slot.team_name}</div>
      <div className="ao-timeline-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) + "%" }}>
            {clock.format(t)}
          </span>
        ))}
      </div>
      <div className="ao-timeline-track">
        {ticks.map((t) => (
          <i key={t} style={{ left: pct(t) + "%" }} />
        ))}
        {marks.map((b) => (
          <span
            key={b.id}
            className="ao-timeline-booked"
            style={block(Date.parse(b.startsAt), Date.parse(b.endsAt))}
            title={
              "Booked " +
              clock.format(new Date(b.startsAt)) +
              "–" +
              clock.format(new Date(b.endsAt))
            }
          >
            Booked
          </span>
        ))}
        <span
          className="ao-timeline-proposed"
          style={block(start, end)}
          title={"Proposed " + clock.format(start) + "–" + clock.format(end)}
        >
          Proposed
        </span>
      </div>
      <small>
        {failed
          ? "Existing bookings could not be loaded."
          : bookings === null
          ? "Loading existing bookings…"
          : "Solid: booked · Dashed: proposed"}
      </small>
    </section>
  );
}
