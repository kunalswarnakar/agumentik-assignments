import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/queue/AppHeader";
import { useLiveTickets } from "@/components/queue/useLiveTickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  agentStatusColor,
  assignNextTicket,
  computeCurrentPriority,
  createAgent,
  deleteAgent,
  resolveTicket,
  setAgentStatus,
  ticketTypeColor,
  type AgentRow,
  type AgentSpecialization,
  type TicketRow,
} from "@/lib/queue";
import {
  CreditCard,
  Wrench,
  Trash2,
  PlayCircle,
  CheckCircle2,
  UserPlus,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — QueueIQ" },
      {
        name: "description",
        content:
          "Manage support agents, their specializations and availability. Assign tickets in queue order.",
      },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const { agents, waiting, inProgress, loading } = useLiveTickets();
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<AgentSpecialization>("billing");
  const [submitting, setSubmitting] = useState(false);

  const head = waiting[0];

  async function addAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createAgent({ name: name.trim(), specialization: spec });
      setName("");
      toast.success("Agent added");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={{ background: "var(--gradient-surface)" }}
    >
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:pt-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Agents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tickets are routed only to agents with a matching specialization.
            The head of queue cannot be bypassed.
          </p>
        </div>

        {/* Routing alert */}
        {head && (
          <RoutingBanner head={head} agents={agents} />
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Agent list */}
          <section className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
            <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Support agents</h2>
                <p className="text-xs text-muted-foreground">
                  {agents.length} agent{agents.length === 1 ? "" : "s"}
                </p>
              </div>
            </header>
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : agents.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserPlus className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium">No agents yet</p>
                <p className="text-xs text-muted-foreground">
                  Add an agent on the right to start serving tickets.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {agents.map((a) => (
                  <AgentItem
                    key={a.id}
                    agent={a}
                    head={head}
                    activeTicket={inProgress.find(
                      (t) => t.assigned_agent_id === a.id,
                    )}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Add agent form */}
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold">Add agent</h2>
            </div>
            <form onSubmit={addAgent} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Specialization</Label>
                <Select
                  value={spec}
                  onValueChange={(v) => setSpec(v as AgentSpecialization)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="h-10 w-full rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                {submitting ? "Adding…" : "Add agent"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

function RoutingBanner({
  head,
  agents,
}: {
  head: TicketRow;
  agents: AgentRow[];
}) {
  const matching = agents.filter(
    (a) =>
      a.specialization === head.ticket_type && a.status === "available",
  );
  const blocked =
    matching.length === 0 &&
    agents.some(
      (a) =>
        a.status === "available" && a.specialization !== head.ticket_type,
    );

  if (!blocked) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-warning-foreground" />
      <div>
        <div className="font-semibold">Queue blocked</div>
        <div className="text-xs opacity-90">
          The head of queue is a <strong>{head.ticket_type}</strong> ticket. No
          available <strong>{head.ticket_type}</strong> agent is online —
          other agents cannot bypass this ticket.
        </div>
      </div>
    </div>
  );
}

function AgentItem({
  agent,
  head,
  activeTicket,
}: {
  agent: AgentRow;
  head: TicketRow | undefined;
  activeTicket: TicketRow | undefined;
}) {
  const [busy, setBusy] = useState(false);

  const canAssign =
    !!head &&
    agent.status === "available" &&
    head.ticket_type === agent.specialization;

  async function toggleAvailability() {
    setBusy(true);
    try {
      await setAgentStatus(
        agent.id,
        agent.status === "available" ? "offline" : "available",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    setBusy(true);
    const r = await assignNextTicket(agent.id);
    setBusy(false);
    if (r.ok) toast.success("Ticket assigned");
    else toast.error(r.reason ?? "Could not assign");
  }

  async function resolve() {
    if (!activeTicket) return;
    setBusy(true);
    const r = await resolveTicket(activeTicket.id);
    setBusy(false);
    if (r.ok) toast.success("Ticket resolved");
    else toast.error(r.reason ?? "Could not resolve");
  }

  async function remove() {
    if (!confirm(`Delete agent ${agent.name}?`)) return;
    setBusy(true);
    try {
      await deleteAgent(agent.id);
      toast.success("Agent removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const SpecIcon = agent.specialization === "billing" ? CreditCard : Wrench;

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3.5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          agent.specialization === "billing"
            ? "bg-warning/15 text-warning-foreground"
            : "bg-accent text-accent-foreground"
        }`}
      >
        <SpecIcon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{agent.name}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${agentStatusColor(
              agent.status,
            )}`}
          >
            {agent.status}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
            {agent.specialization}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {activeTicket ? (
            <>
              Working on{" "}
              <span className="font-mono">
                #{activeTicket.id.slice(0, 8)}
              </span>{" "}
              · {activeTicket.customer_name} ·{" "}
              <span
                className={`rounded px-1 py-0.5 text-[10px] font-medium uppercase ${ticketTypeColor(activeTicket.ticket_type)}`}
              >
                {activeTicket.ticket_type}
              </span>
            </>
          ) : agent.status === "available" ? (
            head ? (
              canAssign ? (
                <>
                  Ready — next is{" "}
                  <span
                    className={`rounded px-1 py-0.5 text-[10px] font-medium uppercase ${ticketTypeColor(head.ticket_type)}`}
                  >
                    {head.ticket_type}
                  </span>{" "}
                  ({computeCurrentPriority(head.initial_priority, head.status, head.created_at).toFixed(1)})
                </>
              ) : (
                <>Waiting — head of queue is {head.ticket_type}</>
              )
            ) : (
              "Idle — no tickets waiting"
            )
          ) : agent.status === "busy" ? (
            "Busy"
          ) : (
            "Offline"
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {activeTicket ? (
          <Button
            size="sm"
            onClick={resolve}
            disabled={busy}
            className="h-8 px-2.5 text-xs"
          >
            <CheckCircle2 className="h-3 w-3" /> Resolve
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={assign}
            disabled={busy || !canAssign}
            className="h-8 px-2.5 text-xs"
            title={
              !head
                ? "No tickets waiting"
                : agent.status !== "available"
                  ? "Agent unavailable"
                  : head.ticket_type !== agent.specialization
                    ? `Head of queue requires a ${head.ticket_type} agent`
                    : "Assign next ticket"
            }
          >
            <PlayCircle className="h-3 w-3" /> Assign
          </Button>
        )}
        {agent.status !== "busy" && (
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAvailability}
            disabled={busy}
            className="h-8 px-2.5 text-xs"
          >
            {agent.status === "available" ? "Go offline" : "Go online"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={remove}
          disabled={busy || agent.status === "busy"}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          title="Remove agent"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}
