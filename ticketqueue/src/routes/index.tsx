import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/queue/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLiveTickets } from "@/components/queue/useLiveTickets";
import {
  computeCurrentPriority,
  createTicket,
  HEARTBEAT_INTERVAL_MS,
  sendHeartbeat,
  ticketTypeColor,
  type TicketType,
} from "@/lib/queue";
import { CreditCard, Wrench, Ticket as TicketIcon, Sparkles, Clock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QueueIQ — Smart Support Queue" },
      { name: "description", content: "Create a support ticket and watch your live queue position update in real time." },
    ],
  }),
  component: CustomerPage,
});

function CustomerPage() {
  const { waiting, expired, tick } = useLiveTickets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("billing");
  const [priority, setPriority] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [myTicketId, setMyTicketId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("myTicketId") : null,
  );

  const myTicket = useMemo(
    () => waiting.find((t) => t.id === myTicketId),
    [waiting, myTicketId],
  );
  const myPosition = useMemo(
    () => (myTicket ? waiting.findIndex((t) => t.id === myTicketId) + 1 : null),
    [waiting, myTicket, myTicketId],
  );
  const myExpired = useMemo(
    () => expired.find((t) => t.id === myTicketId),
    [expired, myTicketId],
  );

  // tick is referenced so the live priority/age recomputes
  void tick;

  // Module 4: send a heartbeat while we have an active ticket so the server
  // does not reap it as inactive.
  useEffect(() => {
    if (!myTicketId || !myTicket) return;
    sendHeartbeat(myTicketId).catch(() => {});
    const id = setInterval(() => {
      sendHeartbeat(myTicketId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [myTicketId, myTicket]);

  // If our ticket got reaped, surface that and clear local state.
  useEffect(() => {
    if (myExpired) {
      toast.error("Your ticket expired", {
        description: "It was removed from the queue due to inactivity.",
      });
      localStorage.removeItem("myTicketId");
      setMyTicketId(null);
    }
  }, [myExpired]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const ticket = await createTicket({
        customer_name: name.trim(),
        description: description.trim() || undefined,
        ticket_type: type,
        initial_priority: priority,
      });
      localStorage.setItem("myTicketId", ticket.id);
      setMyTicketId(ticket.id);
      setDescription("");
      toast.success("Ticket submitted!", { description: "You'll see your queue position update live." });
    } catch (err) {
      toast.error("Could not submit ticket", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-surface)" }}>
      <AppHeader />
      <main className="mx-auto max-w-md px-4 pb-16 pt-6 sm:pt-10">
        {/* Hero */}
        <section className="mb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> Smart priority queue
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            Get help, faster.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit a ticket and watch your priority climb the longer you wait.
          </p>
        </section>

        {/* My ticket card */}
        {myTicket && myPosition && (
          <MyTicketCard
            ticket={myTicket}
            position={myPosition}
            total={waiting.length}
            onClear={() => {
              localStorage.removeItem("myTicketId");
              setMyTicketId(null);
            }}
          />
        )}

        {/* Create ticket */}
        <section
          className="rounded-3xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]"
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TicketIcon className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold">
              {myTicket ? "Create another ticket" : "Create a support ticket"}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Issue type</Label>
              <div className="grid grid-cols-2 gap-2">
                <TypeButton
                  active={type === "billing"}
                  onClick={() => setType("billing")}
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Billing"
                />
                <TypeButton
                  active={type === "technical"}
                  onClick={() => setType("technical")}
                  icon={<Wrench className="h-4 w-4" />}
                  label="Technical"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority">Initial priority</Label>
              <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Low (1)</SelectItem>
                  <SelectItem value="3">Normal (3)</SelectItem>
                  <SelectItem value="5">High (5)</SelectItem>
                  <SelectItem value="8">Urgent (8)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe the issue…"
                rows={3}
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-xl text-primary-foreground shadow-[var(--shadow-elegant)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              {submitting ? "Submitting…" : "Submit ticket"}
            </Button>
          </form>
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {waiting.length} {waiting.length === 1 ? "ticket" : "tickets"} currently waiting
        </p>
      </main>
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MyTicketCard({
  ticket,
  position,
  total,
  onClear,
}: {
  ticket: ReturnType<typeof useLiveTickets>["waiting"][number];
  position: number;
  total: number;
  onClear: () => void;
}) {
  const currentPriority = computeCurrentPriority(
    ticket.initial_priority,
    ticket.status,
    ticket.created_at,
  );
  const ageSec = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 1000);
  const ageStr = formatAge(ageSec);

  return (
    <section
      className="mb-5 overflow-hidden rounded-3xl text-primary-foreground shadow-[var(--shadow-elegant)]"
      style={{ background: "var(--gradient-primary)" }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">Your ticket</div>
            <div className="mt-0.5 font-mono text-xs opacity-70">
              #{ticket.id.slice(0, 8)}
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${ticketTypeColor(
              ticket.ticket_type,
            )}`}
          >
            {ticket.ticket_type}
          </span>
        </div>

        <div className="mt-5 flex items-end gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-80">Position</div>
            <div className="text-5xl font-bold leading-none tabular-nums">
              {position}
              <span className="text-2xl opacity-60">/{total}</span>
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] uppercase tracking-wider opacity-80">Priority</div>
            <div className="text-3xl font-semibold tabular-nums">
              {currentPriority.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs opacity-90">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Waiting {ageStr}
          </span>
          <button
            onClick={onClear}
            className="rounded-md px-2 py-1 underline decoration-white/40 underline-offset-2 hover:decoration-white"
          >
            Forget this ticket
          </button>
        </div>
      </div>
    </section>
  );
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
