import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/queue/AppHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  computeCurrentPriority,
  MAX_DISPLACEMENT,
  pushBackward,
  ticketTypeColor,
  updateTicketStatus,
  type TicketRow,
} from "@/lib/queue";
import { useLiveTickets } from "@/components/queue/useLiveTickets";
import {
  ChevronDown,
  CheckCircle2,
  Play,
  ArrowDown,
  AlertCircle,
  Users,
  Clock,
  Activity,
  UserCog,
  Timer,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — QueueIQ" },
      { name: "description", content: "Monitor the support queue, priorities, and ticket status in real time." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { waiting, inProgress, resolved, expired, agents, loading, tick } =
    useLiveTickets();
  void tick;

  const avgPriority =
    waiting.length === 0
      ? 0
      : waiting.reduce(
          (acc, t) => acc + computeCurrentPriority(t.initial_priority, t.status, t.created_at),
          0,
        ) / waiting.length;

  const longestWait =
    waiting.length === 0
      ? 0
      : Math.max(...waiting.map((t) => Date.now() - new Date(t.created_at).getTime()));

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-surface)" }}>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:pt-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Support Queue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live overview — priority increases automatically, inactive tickets are removed.
            </p>
          </div>
          <Link
            to="/agents"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
          >
            <UserCog className="h-3.5 w-3.5" />
            {agents.length} agent{agents.length === 1 ? "" : "s"} · Manage
          </Link>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Waiting"
            value={waiting.length}
            tone="primary"
          />
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label="In Progress"
            value={inProgress.length}
            tone="warning"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Resolved"
            value={resolved.length}
            tone="success"
          />
          <StatCard
            icon={<Timer className="h-4 w-4" />}
            label="Expired"
            value={expired.length}
            sublabel="Inactive > 30s"
            tone="muted"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Avg priority"
            value={avgPriority.toFixed(1)}
            sublabel={waiting.length > 0 ? `Longest wait: ${formatMs(longestWait)}` : "—"}
            tone="muted"
          />
        </div>

        {/* Queue */}
        <section className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Queue order</h2>
              <p className="text-xs text-muted-foreground">
                Sorted by current priority, then arrival time
              </p>
            </div>
          </header>

          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : waiting.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium">Queue is empty</p>
              <p className="text-xs text-muted-foreground">No customers waiting right now.</p>
            </div>
          ) : (
            <ol className="divide-y divide-border/60">
              {waiting.map((t, i) => (
                <QueueItem key={t.id} ticket={t} position={i + 1} />
              ))}
            </ol>
          )}
        </section>

        {/* Active + Recently resolved */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SidePanel title="In progress" empty="No tickets in progress">
            {inProgress.map((t) => (
              <SideItem
                key={t.id}
                ticket={t}
                action="resolve"
                agentName={
                  agents.find((a) => a.id === t.assigned_agent_id)?.name
                }
              />
            ))}
          </SidePanel>
          <SidePanel title="Recently resolved" empty="No resolved tickets yet">
            {resolved
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
              )
              .slice(0, 8)
              .map((t) => (
                <SideItem key={t.id} ticket={t} action={null} />
              ))}
          </SidePanel>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  tone: "primary" | "success" | "warning" | "muted";
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {sublabel && <div className="mt-0.5 text-[11px] text-muted-foreground">{sublabel}</div>}
    </div>
  );
}

function QueueItem({ ticket, position }: { ticket: TicketRow; position: number }) {
  const [busy, setBusy] = useState(false);
  const currentPriority = computeCurrentPriority(
    ticket.initial_priority,
    ticket.status,
    ticket.created_at,
  );
  const ageMs = Date.now() - new Date(ticket.created_at).getTime();
  const displaced = ticket.displacement_count;
  const displaceLocked = displaced >= MAX_DISPLACEMENT;

  async function handleStart() {
    setBusy(true);
    try {
      await updateTicketStatus(ticket.id, "in_progress");
      toast.success("Ticket assigned");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePushBack() {
    setBusy(true);
    const res = await pushBackward(ticket.id);
    setBusy(false);
    if (res.ok) toast.success("Pushed back one position");
    else toast.error(res.reason ?? "Could not push back");
  }

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3.5 hover:bg-secondary/40">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-sm font-bold tabular-nums">
        {position}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{ticket.customer_name}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ticketTypeColor(ticket.ticket_type)}`}
          >
            {ticket.ticket_type}
          </span>
          {displaced > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                displaceLocked
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {displaceLocked && <AlertCircle className="h-3 w-3" />}
              Pushed {displaced}/{MAX_DISPLACEMENT}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
          <span>·</span>
          <span>Waiting {formatMs(ageMs)}</span>
          {ticket.description && (
            <>
              <span>·</span>
              <span className="truncate">{ticket.description}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</div>
          <div className="text-lg font-semibold tabular-nums">
            {currentPriority.toFixed(1)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Button size="sm" onClick={handleStart} disabled={busy} className="h-7 px-2.5 text-xs">
            <Play className="h-3 w-3" /> Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePushBack}
            disabled={busy || displaceLocked}
            className="h-7 px-2.5 text-xs"
            title={displaceLocked ? "Displacement limit reached" : "Push backward"}
          >
            <ArrowDown className="h-3 w-3" /> Push
          </Button>
        </div>
      </div>
    </li>
  );
}

function SidePanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.some(Boolean) && arr.length > 0 && arr[0] !== undefined;
  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </header>
      {hasItems ? (
        <ul className="divide-y divide-border/60">{children}</ul>
      ) : (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">{empty}</div>
      )}
    </section>
  );
}

function SideItem({
  ticket,
  action,
  agentName,
}: {
  ticket: TicketRow;
  action: "resolve" | null;
  agentName?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function resolve() {
    setBusy(true);
    try {
      await updateTicketStatus(ticket.id, "resolved");
      toast.success("Ticket resolved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{ticket.customer_name}</span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase ${ticketTypeColor(ticket.ticket_type)}`}
          >
            {ticket.ticket_type}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
          {agentName && <> · agent <strong>{agentName}</strong></>}
        </div>
      </div>
      {action === "resolve" && (
        <Button size="sm" onClick={resolve} disabled={busy} className="h-7 px-2.5 text-xs">
          <CheckCircle2 className="h-3 w-3" /> Resolve
        </Button>
      )}
    </li>
  );
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}