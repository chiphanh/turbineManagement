"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./agent.css";
import TeamTimeline from "./TeamTimeline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Sidebar from "./Sidebar";

import {
  faDiagramProject,
  faUsers,
  faCalendarDays,
  faWandMagicSparkles,
  faChartBar,
  faFan,
} from "@fortawesome/free-solid-svg-icons";
type Task = {
  id: string;
  message: string;
  status: string;
  answer: string;
  error?: string;
  created_at: string;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  project_id?: string;
};
type Proposal = {
  id: string;
  project_id: string;
  team_id: string;
  team_name: string;
  project_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  expires_at: string;
  booking_id?: string;
};
type Detail = Task & {
  messages: { id: string; role: string; content: string }[];
  calls: {
    id: string;
    name: string;
    input: unknown;
    output: unknown;
    status: string;
    duration_ms: number;
  }[];
  proposals: Proposal[];
};
type EvalResult = {
  id: string;
  name: string;
  passed: boolean;
  answer?: string;
  error?: string;
  checks?: { name: string; passed: boolean }[];
  calls?: unknown[];
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};
type EvalRun = {
  id: string;
  prompt_version: string;
  model: string;
  status: string;
  created_at: string;
  results: EvalResult[];
};
type Config = {
  configured: boolean;
  model: string;
  timezone: string;
  prompts: Record<string, string>;
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/agent/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : data.message ?? "Request failed"
    );
  return data;
}
const label = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
const when = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(s));
const time = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(s));
function Status({ value }: { value: string }) {
  return (
    <span className={`ao-status ${value}`}>
      {["running", "queued"].includes(value)
        ? "◌ "
        : value === "completed" || value === "confirmed"
        ? "✓ "
        : value === "needs_approval"
        ? "◷ "
        : ""}
      {label(value)}
    </span>
  );
}
// Only turn internally generated project references into links. Never render model HTML.
function Answer({ text }: { text: string }) {
  return (
    <div className="ao-answer">
      {text
        .split(/(\[[^\]]+\]\(\/\?project=[\da-f-]{36}\))/g)
        .map((part, i) => {
          const m = part.match(/^\[([^\]]+)\]\((\/\?project=[\da-f-]{36})\)$/);
          return m ? (
            <Link key={i} href={m[2]}>
              {m[1]}
            </Link>
          ) : (
            part
          );
        })}
    </div>
  );
}
export default function AgentWorkspace({
  evaluations = false,
}: {
  evaluations?: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null);
  const [config, setConfig] = useState<Config | null>(null),
    [message, setMessage] = useState(""),
    [project, setProject] = useState(""),
    [followup, setFollowup] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState("coordinator-v2");
  const [options, setOptions] = useState<
    { id: string; name: string; address: string }[]
  >([]);
  const [runs, setRuns] = useState<EvalRun[]>([]),
    [notice, setNotice] = useState("");
  const selectedRef = useRef("");
  selectedRef.current = selected;
  const load = useCallback(async () => {
    const [c, t, r, p] = await Promise.all([
      api<Config>("config"),
      api<Task[]>("tasks"),
      api<EvalRun[]>("evaluations"),
      api<{ id: string; name: string; address: string }[]>("projects"),
    ]);
    setOptions(p);
    setConfig(c);
    setTasks(t);
    setRuns(r);
    setError("");
    if (!selectedRef.current && t.length) setSelected(t[0].id);
  }, []);
  useEffect(() => {
    let live = true;
    load()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const timer = setInterval(() => {
      void load().catch((e) => {
        if (live) setError(e.message);
      });
    }, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    setDetail(null);
    const fetchDetail = () =>
      api<Detail>("tasks/" + selected)
        .then((d) => {
          if (live) setDetail(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    void fetchDetail();
    const timer = setInterval(() => void fetchDetail(), 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      if (selectedRef.current)
        setDetail(await api<Detail>("tasks/" + selectedRef.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      const t = await api<Task>("tasks", {
        message,
        ...(project ? { projectId: project } : {}),
        promptVersion: version,
      });
      setSelected(t.id);
      selectedRef.current = t.id;
      setMessage("");
    });
  }
  async function reply(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      await api("tasks/" + selected + "/messages", { message: followup });
      setFollowup("");
    });
  }
  const isRunning = detail && ["queued", "running"].includes(detail.status);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
  const todays = tasks.filter(
    (t) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(
        new Date(t.created_at)
      ) === today
  );
  return (
    <div className="shell">
      <Sidebar active={evaluations ? "evaluations" : "ai-operations"} />
      <div className="ao-shell ao-workspace-content">
        <main className="ao-main">
          <section className="ao-content">
            <header className="ao-heading">
              <div>
                <h1>{evaluations ? "Agent evaluations" : "AI Operations"}</h1>
              </div>
              <span className="ao-model">{config?.model ?? "Connecting…"}</span>
            </header>
            {error && (
              <div role="alert" className="ao-alert">
                {error}
                <button
                  onClick={() => void load().catch((e) => setError(e.message))}
                >
                  Retry connection
                </button>
              </div>
            )}
            {notice && (
              <div role="status" className="ao-notice">
                {notice}
              </div>
            )}
            {config && !config.configured && (
              <div className="ao-alert">
                Groq is not configured. Add GROQ_API_KEY to the backend .env and
                restart. Your existing tasks remain available.
              </div>
            )}
            {evaluations ? (
              <>
                <div className="ao-evaltoolbar">
                  <div>
                    <h2>Fixture evaluation suite</h2>
                    <p>
                      8 scenarios · Real model calls · No project or booking
                      writes
                    </p>
                  </div>
                  <select
                    aria-label="Prompt version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  >
                    <option>coordinator-v2</option>
                    <option>coordinator-v1</option>
                  </select>
                  <button
                    className="ao-primary"
                    disabled={
                      busy ||
                      !config?.configured ||
                      runs.some((r) => r.status === "running")
                    }
                    onClick={() =>
                      void act(async () => {
                        await api("evaluations", { promptVersion: version });
                        setNotice(
                          "Evaluation started. Results appear as each scenario finishes."
                        );
                      })
                    }
                  >
                    Run evaluations
                  </button>
                </div>
                <details className="ao-prompt">
                  <summary>Inspect {version} instructions</summary>
                  <pre>{config?.prompts[version]}</pre>
                </details>

                <div className="ao-evalgrid">
                  {runs.map((run) => (
                    <article className="ao-card ao-evalcard" key={run.id}>
                      <div className="ao-cardheading">
                        <h2>{run.prompt_version}</h2>
                        <Status value={run.status} />
                      </div>
                      <small>
                        {when(run.created_at)} · {run.model}
                      </small>
                      <div className="ao-evalstats">
                        <strong>
                          {run.results.filter((r) => r.passed).length}/
                          {run.results.length || 8}
                        </strong>
                        <span>
                          checks passed ·{" "}
                          {run.results
                            .reduce(
                              (n, r) =>
                                n +
                                (r.inputTokens ?? 0) +
                                (r.outputTokens ?? 0),
                              0
                            )
                            .toLocaleString()}{" "}
                          tokens
                        </span>
                      </div>
                      {run.results.map((r) => (
                        <details key={r.id} className="ao-evalresult">
                          <summary>
                            <span>
                              {r.passed ? "✓" : "!"} {r.name}
                            </span>
                            <b>{r.passed ? "Pass" : "Fail"}</b>
                          </summary>
                          {r.error && <p>{r.error}</p>}
                          {r.checks?.map((c) => (
                            <p key={c.name}>
                              {c.passed ? "✓" : "✕"} {c.name}
                            </p>
                          ))}
                          {r.answer && <Answer text={r.answer} />}
                          <pre>{JSON.stringify(r.calls, null, 2)}</pre>
                          <small>Human answer review required</small>
                        </details>
                      ))}
                    </article>
                  ))}
                </div>
                {!runs.length && !loading && (
                  <div className="ao-empty">
                    No evaluations yet. Run v1, then v2 to compare their
                    behavior.
                  </div>
                )}
              </>
            ) : (
              <>
                <form className="ao-command" onSubmit={submit}>
                  <input
                    aria-label="New AI task"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={4000}
                    placeholder="Find a team for an installation next week…"
                    required
                  />
                  <button
                    className="ao-primary"
                    disabled={busy || !config?.configured || !message.trim()}
                  >
                    Run task ↗
                  </button>
                </form>
                <div className="ao-options">
                  <label>
                    Project context{" "}
                    <select
                      aria-label="Project context"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    >
                      <option value="">All projects</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.address}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      setMessage(
                        "Which installation projects are delayed? Search the project notes and explain the evidence."
                      )
                    }
                  >
                    Review delays
                  </button>
                  <button
                    onClick={() =>
                      setMessage(
                        "Find a team for an installation next week. Ask me which project to use."
                      )
                    }
                  >
                    Find a slot
                  </button>
                </div>
                <div className="ao-grid">
                  <section className="ao-card ao-tasks">
                    <div className="ao-cardheading">
                      <h2>Recent tasks</h2>
                      <span className="ao-count">{tasks.length}</span>
                    </div>
                    {loading ? (
                      <div className="ao-empty">Loading tasks…</div>
                    ) : tasks.length === 0 ? (
                      <div className="ao-empty">
                        Your first task starts above.
                        <p>
                          Ask about a project, review notes or find an
                          installation slot.
                        </p>
                      </div>
                    ) : (
                      tasks.map((t) => (
                        <button
                          key={t.id}
                          className={`ao-task ${
                            selected === t.id ? "active" : ""
                          }`}
                          onClick={() => setSelected(t.id)}
                        >
                          <div>
                            <strong>{t.message}</strong>
                            <Status value={t.status} />
                          </div>
                          <small>{when(t.created_at)}</small>
                        </button>
                      ))
                    )}
                  </section>
                  <section className="ao-card ao-detail">
                    {!detail ? (
                      <div className="ao-empty">
                        {selected
                          ? "Loading task…"
                          : "Select a task to see its work."}
                      </div>
                    ) : (
                      <>
                        <div className="ao-cardheading">
                          <div>
                            <h2>Installation coordinator</h2>
                            <small>{detail.prompt_version}</small>
                          </div>
                          <Status value={detail.status} />
                        </div>
                        <div className="ao-detailbody">
                          <h3>Request</h3>
                          <p>{detail.message}</p>
                          {detail.project_id && (
                            <Link href={"/?project=" + detail.project_id}>
                              Open project ↗
                            </Link>
                          )}
                          <h3>Activity</h3>
                          {detail.calls.length === 0 && (
                            <p className="ao-muted">
                              {isRunning
                                ? "The coordinator is reviewing your request…"
                                : "No tools were needed for this task."}
                            </p>
                          )}
                          <ol className="ao-activity">
                            {detail.calls.map((c) => (
                              <li key={c.id}>
                                <span className={"ao-step " + c.status}>
                                  {c.status === "completed"
                                    ? "✓"
                                    : c.status === "failed"
                                    ? "!"
                                    : "◌"}
                                </span>
                                <div>
                                  <strong>
                                    {label(c.name.replace(/([A-Z])/g, " $1"))}
                                  </strong>
                                  <small>{label(c.status)}</small>
                                </div>
                                <small>
                                  {c.duration_ms != null
                                    ? `${(c.duration_ms / 1000).toFixed(1)}s`
                                    : ""}
                                </small>
                              </li>
                            ))}
                          </ol>
                          {detail.error && (
                            <p role="alert" className="ao-alert">
                              {detail.error}
                            </p>
                          )}
                          {detail.answer && (
                            <>
                              <h3>Result</h3>
                              <Answer text={detail.answer} />
                            </>
                          )}
                          {detail.proposals.find(
                            (p) => p.status === "pending"
                          ) && (
                            <TeamTimeline
                              slot={
                                detail.proposals.find(
                                  (p) => p.status === "pending"
                                )!
                              }
                            />
                          )}{" "}
                          {detail.proposals.map((p) => (
                            <div
                              className={"ao-proposal " + p.status}
                              key={p.id}
                            >
                              <div className="ao-cardheading">
                                <h3>
                                  {p.status === "pending"
                                    ? "Ready for your approval"
                                    : p.status === "confirmed"
                                    ? "Booking confirmed"
                                    : `Proposal ${p.status}`}
                                </h3>
                              </div>
                              <dl>
                                <dt>Project</dt>
                                <dd>{p.project_name}</dd>
                                <dt>Team</dt>
                                <dd>{p.team_name}</dd>
                                <dt>Date</dt>
                                <dd>{when(p.starts_at)}</dd>
                                <dt>Until</dt>
                                <dd>{time(p.ends_at)} · Europe/Berlin</dd>
                                <dt>Status</dt>
                                <dd>{label(p.status)}</dd>
                              </dl>
                              {p.status === "pending" && (
                                <>
                                  <p className="ao-muted">
                                    Rechecked at confirmation · Expires{" "}
                                    {time(p.expires_at)}
                                    <br />
                                    An unassigned project will be assigned to
                                    this team.
                                  </p>
                                  <div className="ao-buttons">
                                    <button
                                      className="ao-primary"
                                      disabled={busy || !!isRunning}
                                      onClick={() =>
                                        void act(async () => {
                                          await api(
                                            "proposals/" + p.id + "/confirm",
                                            {}
                                          );
                                          setNotice(
                                            "Booking created. Your installation schedule is updated."
                                          );
                                        })
                                      }
                                    >
                                      Confirm booking
                                    </button>
                                    <button
                                      disabled={busy || !!isRunning}
                                      onClick={() =>
                                        void act(async () => {
                                          await api(
                                            "proposals/" + p.id + "/reject",
                                            {}
                                          );
                                          setFollowup(
                                            "Find another available slot for this project."
                                          );
                                        })
                                      }
                                    >
                                      Find another slot
                                    </button>
                                    <button
                                      disabled={busy || !!isRunning}
                                      onClick={() =>
                                        void act(async () => {
                                          await api(
                                            "proposals/" + p.id + "/reject",
                                            {}
                                          );
                                        })
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </>
                              )}
                              {p.booking_id && (
                                <Link href="/?view=schedule">
                                  Open schedule ↗
                                </Link>
                              )}
                            </div>
                          ))}
                          <details className="ao-trace">
                            <summary>View tool calls & usage</summary>
                            <p>
                              {detail.input_tokens.toLocaleString()} input ·{" "}
                              {detail.output_tokens.toLocaleString()} output
                              tokens ·{" "}
                              {((detail.duration_ms ?? 0) / 1000).toFixed(1)}s
                            </p>
                            {detail.calls.map((c) => (
                              <div key={c.id}>
                                <b>{c.name}</b>
                                <pre>
                                  {JSON.stringify(
                                    { input: c.input, output: c.output },
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            ))}
                          </details>
                          <details className="ao-trace">
                            <summary>Conversation history</summary>
                            {detail.messages.map((m) => (
                              <div key={m.id}>
                                <h3>{label(m.role)}</h3>
                                <Answer text={m.content} />
                              </div>
                            ))}
                          </details>
                          <form className="ao-followup" onSubmit={reply}>
                            <input
                              aria-label="Follow-up message"
                              placeholder="Ask a follow-up…"
                              value={followup}
                              maxLength={4000}
                              onChange={(e) => setFollowup(e.target.value)}
                              required
                            />
                            <button
                              aria-label="Send follow-up"
                              disabled={
                                busy ||
                                !!isRunning ||
                                !followup.trim() ||
                                !config?.configured
                              }
                            >
                              ↑
                            </button>
                          </form>
                        </div>
                      </>
                    )}
                  </section>
                  <aside className="ao-metrics">
                    <div className="ao-card">
                      <h2>Today</h2>
                      {[
                        [
                          todays.filter((t) => t.status === "completed").length,
                          "Tasks completed",
                        ],
                        [
                          todays.filter((t) => t.status === "needs_approval")
                            .length,
                          "Pending approval",
                        ],
                        [
                          todays.filter((t) => t.status === "failed").length,
                          "Failed runs",
                        ],
                      ].map(([n, t]) => (
                        <div className="ao-metric" key={t}>
                          <strong>{n}</strong>
                          <span>{t}</span>
                        </div>
                      ))}
                      <small>Latest 100 tasks · Berlin time</small>
                    </div>
                    <div className="ao-card">
                      <h2>AI Coordinator</h2>
                      <p>
                        <span className="ao-dot" />
                        {config?.configured
                          ? "Connected to Groq"
                          : "Setup required"}
                      </p>
                      <p className="ao-muted">
                        Finds projects, checks team availability and proposes
                        installations.
                      </p>
                      <small>Bookings always require approval.</small>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
