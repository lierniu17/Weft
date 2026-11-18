import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { FiMessageCircle, FiShare2, FiUser, FiUsers } from "react-icons/fi";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useMe } from "../api/auth.ts";
import { api, enc, setUnauthenticatedHandler } from "../api/client.ts";
import { type EntryDetail, useEntries } from "../api/entries.ts";
import { keys } from "../api/keys.ts";
import { Skeleton } from "../components/basics/Skeleton/Skeleton.tsx";
import type { RecentPerson } from "../components/composites/SideNav/SideNav.tsx";
import { SideNav } from "../components/composites/SideNav/SideNav.tsx";
import { type NavItem, TabBar } from "../components/composites/TabBar/TabBar.tsx";
import { useLayout } from "./layout.ts";

const PENDING = "有待确认的草稿";

function section(pathname: string): string {
  if (pathname.startsWith("/people")) return "people";
  if (pathname.startsWith("/graph")) return "graph";
  if (pathname.startsWith("/me")) return "me";
  return "chat";
}

/** One key per page URL (trailing slash ignored): moving to another person replays the enter. */
function pageKey(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

const PATHS: Record<string, string> = { chat: "/", people: "/people", graph: "/graph", me: "/me" };

/** 「最近提到」: people in the latest confirmed Entries (cached with the chat's queries). */
function useRecentPersons(enabled: boolean): RecentPerson[] {
  const entries = useEntries(enabled);
  const latest = (entries.data ?? [])
    .filter((e) => e.kind === "user" && e.draft?.status === "confirmed")
    .slice(0, 6);
  const details = useQueries({
    queries: latest.map((e) => ({
      queryKey: keys.entry(e.id),
      queryFn: () => api.get<EntryDetail>(`/entries/${enc(e.id)}`),
      enabled,
    })),
  });
  const seen = new Map<string, RecentPerson>();
  for (const d of details) {
    for (const p of d.data?.persons ?? []) {
      if (!p.is_self && !seen.has(p.id)) {
        seen.set(p.id, { id: p.id, name: p.name, alias: p.aliases[0] ?? null });
      }
    }
  }
  return [...seen.values()].slice(0, 6);
}

/**
 * The logged-in frame: bottom TabBar on mobile; SideNav (icons only on tablet, 232px with
 * 「最近提到」 on desktop) from 768px up. Pages centre their content in CONTENT_COLUMN
 * (max 720px) and put a desktop right column (RIGHT_COLUMN, 380px) beside it.
 */
export function AppShell() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const layout = useLayout();
  const entries = useEntries(Boolean(me.data));
  const recent = useRecentPersons(layout === "desktop" && Boolean(me.data));

  useEffect(() => {
    // A session that expires mid-use: back to 登录, then back to where the user was.
    setUnauthenticatedHandler(() => {
      const from = window.location.pathname + window.location.search;
      navigate("/login", { replace: true, state: from === "/" ? undefined : { from } });
    });
    return () => setUnauthenticatedHandler(null);
  }, [navigate]);

  if (me.isPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="正在加载"
        className="flex flex-col gap-md p-md"
      >
        <Skeleton width="40%" />
        <Skeleton variant="card" />
      </div>
    );
  }
  if (!me.data) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={from === "/" ? undefined : { from }} />;
  }

  const pending = (entries.data ?? []).some((e) => e.draft?.status === "pending");
  const current = section(location.pathname);
  const chat: NavItem = {
    value: "chat",
    label: "对话",
    icon: <FiMessageCircle />,
    dot: pending ? PENDING : undefined,
  };
  const people: NavItem = { value: "people", label: "人物", icon: <FiUsers /> };
  const graph: NavItem = { value: "graph", label: "全景图", icon: <FiShare2 /> };
  const mine: NavItem = { value: "me", label: "我的", icon: <FiUser /> };
  const go = (value: string) => navigate(PATHS[value]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-bg-layout">
      <div className="flex min-h-[0] w-full flex-1">
        {layout !== "mobile" && (
          <SideNav
            items={[chat, people, graph, mine]}
            value={current}
            onValueChange={go}
            collapsed={layout === "tablet"}
            recent={recent}
            onRecentClick={(id) => navigate(`/people/${enc(id)}`)}
          />
        )}
        <main className="flex min-w-[0] flex-1 flex-col overflow-hidden bg-neutral-bg-layout">
          {/* Page enter (AC-12): keyed on the route so each page fades + rises in once;
                navigation is never held back for an exit animation. */}
          <div
            key={pageKey(location.pathname)}
            data-page=""
            className="motion-page-enter flex min-h-[0] flex-1 flex-col"
          >
            <Outlet />
          </div>
        </main>
      </div>
      {layout === "mobile" && (
        <TabBar
          items={[chat, people, mine]}
          value={current === "graph" ? "people" : current}
          onValueChange={go}
        />
      )}
    </div>
  );
}
