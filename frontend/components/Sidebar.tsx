import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faChartBar,
  faDiagramProject,
  faFan,
  faUsers,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";

export type DashboardView = "projects" | "teams" | "schedule";

type Props =
  | { active: DashboardView; onViewChange: (view: DashboardView) => void }
  | { active: "ai-operations" | "evaluations"; onViewChange?: never };

const dashboardLinks = [
  { view: "projects", href: "/", label: "Projects", icon: faDiagramProject },
  { view: "teams", href: "/?view=teams", label: "Teams", icon: faUsers },
  {
    view: "schedule",
    href: "/?view=schedule",
    label: "Schedule",
    icon: faCalendarDays,
  },
] as const;

const agentLinks = [
  {
    view: "ai-operations",
    href: "/ai-operations",
    label: "AI Operations",
    icon: faWandMagicSparkles,
  },
] as const;

export default function Sidebar({ active, onViewChange }: Props) {
  return (
    <aside className="sidebar">
      <a className="brand" href="/">
        <FontAwesomeIcon icon={faFan} aria-hidden="true" />
        <span>TurbineOps</span>
      </a>
      <p className="eyebrow">WORKSPACE</p>
      <nav aria-label="Workspace">
        {dashboardLinks.map(({ view, href, label, icon }) => {
          const className = active === view ? "nav active" : "nav";
          const content = (
            <>
              <FontAwesomeIcon icon={icon} aria-hidden="true" />
              {label}
            </>
          );
          return onViewChange ? (
            <button
              key={view}
              type="button"
              className={className}
              aria-current={active === view ? "page" : undefined}
              onClick={() => onViewChange(view)}
            >
              {content}
            </button>
          ) : (
            <Link key={view} href={href} className={className}>
              {content}
            </Link>
          );
        })}
        {agentLinks.map(({ view, href, label, icon }) => (
          <Link
            key={view}
            href={href}
            className={active === view ? "nav active" : "nav"}
            aria-current={active === view ? "page" : undefined}
          >
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="sideFoot">
        <span className="dot" /> Local development
        <p>Installation management</p>
      </div>
    </aside>
  );
}
