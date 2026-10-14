"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiagramProject,
  faUsers,
  faCalendarDays,
  faTurbi,
} from "@fortawesome/free-solid-svg-icons";

type Stage = "inspection" | "planning" | "installation" | "completed";
type Project = {
  id: string;
  customerName: string;
  address: string;
  ratedPowerKw: number;
  stage: Stage;
  notes: string;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
};
type Team = { id: string; name: string; active: boolean };
type Booking = {
  id: string;
  projectId: string;
  teamId: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "cancelled";
};
type ProjectPage = {
  data: Project[];
  total: number;
  page: number;
  pageSize: number;
};
const stages: Stage[] = ["inspection", "planning", "installation", "completed"];
const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"
).replace(/\/$/, "");
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const response = await fetch(apiBase + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      Array.isArray(result?.message)
        ? result.message.join(". ")
        : result?.message ?? `Request failed (${response.status})`
    );
  return result as T;
}
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(s));
function Badge({ stage }: { stage: Stage }) {
  return <span className={`badge ${stage}`}>{title(stage)}</span>;
}
function field(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export default function Dashboard() {
  const [view, setView] = useState<"projects" | "teams" | "schedule">(
    "projects"
  );
  const [projects, setProjects] = useState<ProjectPage>({
    data: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [bookingProject, setBookingProject] = useState<Project | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [scheduleProjects, setScheduleProjects] = useState<
    Record<string, string>
  >({});
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (search) q.set("search", search);
    if (stage) q.set("stage", stage);
    Promise.all([
      api<ProjectPage>("/projects?" + q),
      api<Team[]>("/teams"),
      api<Booking[]>("/bookings"),
    ])
      .then(([p, t, b]) => {
        if (live) {
          setProjects(p);
          setTeams(t);
          setBookings(b);
        }
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "Could not load data");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, search, stage, revision]);
  useEffect(() => {
    let live = true;
    const ids = [...new Set(bookings.map((b) => b.projectId))];
    Promise.all(
      ids.map(async (id) => {
        const p = await api<Project>("/projects/" + id);
        return [id, p.customerName] as const;
      })
    )
      .then((rows) => {
        if (live) setScheduleProjects(Object.fromEntries(rows));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bookings]);
  const mutate = useCallback(
    async (action: () => Promise<void>, message: string) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await action();
        setNotice(message);
        setRevision((v) => v + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    []
  );
  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body = {
      customerName: field(f, "customerName"),
      address: field(f, "address"),
      ratedPowerKw: Number(f.get("ratedPowerKw")),
      stage: field(f, "stage"),
      notes: String(f.get("notes") ?? ""),
    };
    await mutate(async () => {
      const result = await api<Project>(
        selected && !creating ? "/projects/" + selected.id : "/projects",
        selected && !creating ? "PATCH" : "POST",
        body
      );
      setSelected(result);
      setCreating(false);
    }, "Project saved");
  }
  async function assignTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const teamId = field(new FormData(event.currentTarget), "teamId") || null;
    await mutate(async () => {
      await api("/projects/" + selected.id + "/team", "PATCH", { teamId });
      setSelected(await api<Project>("/projects/" + selected.id));
    }, "Team assignment updated");
  }
  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = field(new FormData(form), "name");
    await mutate(async () => {
      await api("/teams", "POST", { name });
      form.reset();
    }, "Team created");
  }
  async function editTeam(event: FormEvent<HTMLFormElement>, team: Team) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await mutate(async () => {
      await api("/teams/" + team.id, "PATCH", {
        name: field(f, "name"),
        active: f.get("active") === "on",
      });
    }, "Team updated");
  }
  async function loadBookingProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(async () => {
      setBookingProject(await api<Project>("/projects/" + bookingId.trim()));
    }, "Project loaded");
  }
  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingProject?.teamId) return;
    const f = new FormData(event.currentTarget);
    // datetime-local values use the browser's timezone, then convert to UTC instants.
    const startsAt = new Date(field(f, "startsAt")).toISOString();
    const endsAt = new Date(field(f, "endsAt")).toISOString();
    await mutate(async () => {
      await api("/bookings", "POST", {
        projectId: bookingProject.id,
        teamId: bookingProject.teamId,
        startsAt,
        endsAt,
      });
      setBookingProject(null);
    }, "Installation scheduled");
  }
  const activeBookings = bookings.filter((b) => b.status === "scheduled");
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          ✳ <span>TurbineOps</span>
        </a>
        <p className="eyebrow">WORKSPACE</p>
        <nav>
          {(["projects", "teams", "schedule"] as const).map((v, i) => (
            <button
              key={v}
              className={view === v ? "nav active" : "nav"}
              onClick={() => setView(v)}
            >
              <FontAwesomeIcon
                icon={[faDiagramProject, faUsers, faCalendarDays][i]}
                aria-hidden="true"
              />
              {title(v)}
            </button>
          ))}
        </nav>
        <div className="sideFoot">
          <span className="dot" /> Local development
          <p>Installation management</p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">OPERATIONS / {view.toUpperCase()}</p>
            <h1>
              {view === "projects"
                ? "Installation projects"
                : view === "teams"
                ? "Your installation teams"
                : "Installation schedule"}
            </h1>
            <p className="subtitle">
              {view === "projects"
                ? "From first inspection to final handover."
                : view === "teams"
                ? "Build the teams that move projects forward."
                : "Reserve time. Keep every team on track."}
            </p>
          </div>
          {view === "projects" && (
            <button
              className="primary"
              onClick={() => {
                setSelected(null);
                setCreating(true);
              }}
            >
              ＋ New project
            </button>
          )}
        </header>

        {error && (
          <div className="alert error" role="alert">
            {error}. <button onClick={refresh}>Retry loading</button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        <section className="stats">
          <article>
            <span>Projects matching filters</span>
            <strong>{projects.total}</strong>
            <small>Across all pages</small>
          </article>
          <article>
            <span>Active teams</span>
            <strong>{teams.filter((t) => t.active).length}</strong>
            <small>Available for assignment</small>
          </article>
          <article>
            <span>Scheduled installations</span>
            <strong>{activeBookings.length}</strong>
            <small>Bookings with scheduled status</small>
          </article>
        </section>
        {view === "projects" && (
          <div className="workspace">
            <section className="card list">
              <form
                className="filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(draftSearch.trim());
                  setPage(1);
                }}
              >
                <label className="search">
                  <span className="sr">Search projects</span>
                  <input
                    placeholder="Search customers or locations…"
                    value={draftSearch}
                    onChange={(e) => setDraftSearch(e.target.value)}
                  />
                </label>
                <button type="submit" className="secondary">
                  Search
                </button>
                <label>
                  <span className="sr">Filter by stage</span>
                  <select
                    value={stage}
                    onChange={(e) => {
                      setStage(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All stages</option>
                    {stages.map((s) => (
                      <option key={s} value={s}>
                        {title(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </form>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer / project</th>
                      <th>Location</th>
                      <th>Power</th>
                      <th>Stage</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {projects.data.map((p) => (
                      <tr
                        key={p.id}
                        className={selected?.id === p.id ? "selected" : ""}
                      >
                        <td>
                          <strong>{p.customerName}</strong>
                          <small>{p.id.slice(0, 8)}</small>
                        </td>
                        <td>{p.address}</td>
                        <td>{p.ratedPowerKw} kW</td>
                        <td>
                          <Badge stage={p.stage} />
                        </td>
                        <td>
                          <button
                            aria-label={"Open " + p.customerName}
                            className="open"
                            onClick={() => {
                              setSelected(p);
                              setCreating(false);
                            }}
                          >
                            ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && (
                <p className="empty" role="status">
                  Loading projects…
                </p>
              )}
              {!loading && !projects.data.length && (
                <p className="empty">
                  No projects found. Create one or adjust your filters.
                </p>
              )}
              <footer className="pagination">
                <span>
                  Page {page} of {Math.max(1, Math.ceil(projects.total / 10))}
                </span>
                <div>
                  <button
                    disabled={loading || page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Previous
                  </button>
                  <button
                    disabled={loading || page * 10 >= projects.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              </footer>
            </section>
            <section className="card detail">
              {selected || creating ? (
                <>
                  <div className="detailHeading">
                    <div>
                      <p className="eyebrow">
                        {creating ? "NEW INSTALLATION" : "PROJECT DETAILS"}
                      </p>
                      <h2>
                        {creating ? "Create a project" : selected?.customerName}
                      </h2>
                    </div>
                    <button
                      aria-label="Close project details"
                      onClick={() => {
                        setSelected(null);
                        setCreating(false);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <form
                    key={
                      creating
                        ? "new"
                        : selected?.id + "-" + selected?.updatedAt
                    }
                    onSubmit={saveProject}
                  >
                    <label>
                      Customer name
                      <input
                        name="customerName"
                        required
                        maxLength={120}
                        defaultValue={creating ? "" : selected?.customerName}
                      />
                    </label>
                    <label>
                      Installation address
                      <input
                        name="address"
                        required
                        maxLength={300}
                        defaultValue={creating ? "" : selected?.address}
                      />
                    </label>
                    <div className="two">
                      <label>
                        Rated power (kW)
                        <input
                          name="ratedPowerKw"
                          type="number"
                          min="0.01"
                          max="99999999.99"
                          step="0.01"
                          required
                          defaultValue={creating ? "" : selected?.ratedPowerKw}
                        />
                      </label>
                      <label>
                        Stage
                        <select
                          name="stage"
                          defaultValue={
                            creating ? "inspection" : selected?.stage
                          }
                        >
                          {stages.map((s) => (
                            <option key={s} value={s}>
                              {title(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Project notes
                      <textarea
                        name="notes"
                        maxLength={10000}
                        rows={5}
                        placeholder="Site conditions, inspection results, next steps…"
                        defaultValue={creating ? "" : selected?.notes}
                      />
                    </label>
                    <button className="primary wide" disabled={busy}>
                      {busy
                        ? "Saving…"
                        : creating
                        ? "Create project"
                        : "Save changes"}
                    </button>
                  </form>
                  {selected && !creating && (
                    <>
                      <form
                        className="assignment"
                        key={selected.id + "-" + selected.teamId}
                        onSubmit={assignTeam}
                      >
                        <label>
                          Assigned team
                          <select
                            name="teamId"
                            defaultValue={selected.teamId ?? ""}
                          >
                            <option value="">No team assigned</option>
                            {teams.map((t) => (
                              <option
                                key={t.id}
                                value={t.id}
                                disabled={!t.active}
                              >
                                {t.name}
                                {!t.active ? " (inactive)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="secondary wide" disabled={busy}>
                          Update assignment
                        </button>
                      </form>
                      <button
                        className="secondary wide"
                        disabled={!selected.teamId}
                        onClick={() => {
                          setBookingId(selected.id);
                          setBookingProject(selected);
                          setView("schedule");
                        }}
                      >
                        Schedule installation →
                      </button>
                      <small className="updated">
                        Updated {when(selected.updatedAt)}
                      </small>
                    </>
                  )}
                </>
              ) : (
                <div className="placeholder">
                  <span>↗</span>
                  <h2>A closer look</h2>
                  <p>
                    Open a project to edit its details, notes, and team
                    assignment.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
        {view === "teams" && (
          <section className="card">
            <div className="sectionHeading">
              <h2>Team directory</h2>
              <span>{teams.length} teams</span>
            </div>
            <form className="filters" onSubmit={createTeam}>
              <label className="search">
                <span className="sr">New team name</span>
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="New team name, e.g. Team West"
                />
              </label>
              <button className="primary" disabled={busy}>
                ＋ Add team
              </button>
            </form>
            <div className="teamGrid">
              {teams.map((t) => (
                <form
                  className="teamCard"
                  key={t.id + "-" + t.name + "-" + t.active}
                  onSubmit={(e) => editTeam(e, t)}
                >
                  <span className="teamIcon">♧</span>
                  <label>
                    Team name
                    <input
                      name="name"
                      defaultValue={t.name}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={t.active}
                    />
                    Active team
                  </label>
                  <button className="secondary" disabled={busy}>
                    Save team
                  </button>
                </form>
              ))}
            </div>
            {!teams.length && !loading && (
              <p className="empty">
                Create your first installation team above.
              </p>
            )}
          </section>
        )}
        {view === "schedule" && (
          <div className="workspace">
            <section className="card list">
              <div className="sectionHeading">
                <h2>Booked installations</h2>
                <span>Times shown in Europe/Berlin</span>
              </div>
              <div className="bookingList">
                {bookings.map((b) => (
                  <article className="booking" key={b.id}>
                    <div className="bookingDate">▦</div>
                    <div>
                      <strong>
                        {scheduleProjects[b.projectId] ??
                          b.projectId.slice(0, 8)}
                      </strong>
                      <p>
                        {teams.find((t) => t.id === b.teamId)?.name ?? "Team"} ·{" "}
                        {title(b.status)}
                      </p>
                      <small>
                        {when(b.startsAt)} → {when(b.endsAt)}
                      </small>
                    </div>
                    {b.status === "scheduled" && (
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm("Cancel this installation booking?")
                          )
                            void mutate(async () => {
                              await api(
                                "/bookings/" + b.id + "/cancel",
                                "POST"
                              );
                            }, "Booking cancelled");
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!bookings.length && !loading && (
                <p className="empty">No installations booked yet.</p>
              )}
            </section>
            <section className="card detail">
              <p className="eyebrow">RESERVE A TIME</p>
              <h2>Schedule installation</h2>
              <p className="hint">
                Open a project and assign a team first, or load a project by its
                full ID below.
              </p>
              <form onSubmit={loadBookingProject}>
                <label>
                  Project ID
                  <input
                    required
                    value={bookingId}
                    onChange={(e) => {
                      setBookingId(e.target.value);
                      setBookingProject(null);
                    }}
                    placeholder="Paste the project UUID"
                  />
                </label>
                <button className="secondary wide" disabled={busy}>
                  Load project
                </button>
              </form>
              {bookingProject && (
                <>
                  <div className="loaded">
                    <strong>{bookingProject.customerName}</strong>
                    <p>{bookingProject.address}</p>
                    <small>
                      {teams.find((t) => t.id === bookingProject.teamId)
                        ?.name ?? "No team assigned"}
                    </small>
                  </div>
                  {bookingProject.teamId ? (
                    <form onSubmit={schedule}>
                      <p className="hint">
                        Enter times in your browser timezone:{" "}
                        <strong>{localTimezone}</strong>.
                      </p>
                      <label>
                        Starts at
                        <input name="startsAt" type="datetime-local" required />
                      </label>
                      <label>
                        Ends at
                        <input name="endsAt" type="datetime-local" required />
                      </label>
                      <button className="primary wide" disabled={busy}>
                        Book installation
                      </button>
                      <p className="hint">
                        Overlapping bookings are rejected by the backend. Cancel
                        an existing booking before rescheduling.
                      </p>
                    </form>
                  ) : (
                    <p className="alert error">
                      Assign a team from the project details first.
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
