import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TicketRow = Database["public"]["Tables"]["tickets"]["Row"];
export type QueueRow = Database["public"]["Views"]["queue_view"]["Row"];
export type TicketType = Database["public"]["Enums"]["ticket_type"];
export type TicketStatus = Database["public"]["Enums"]["ticket_status"];
export type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
export type AgentSpecialization = Database["public"]["Enums"]["agent_specialization"];
export type AgentStatus = Database["public"]["Enums"]["agent_status"];

export const MAX_DISPLACEMENT = 3;
/** Heartbeat interval and reaper threshold (must be < 30s server-side reaper). */
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/** Computes priority client-side so the UI updates every second without DB round-trips. */
export function computeCurrentPriority(
  initialPriority: number,
  status: TicketStatus,
  createdAt: string,
  now: number = Date.now(),
): number {
  if (status !== "waiting") return initialPriority;
  const ageMinutes = (now - new Date(createdAt).getTime()) / 60000;
  return initialPriority + ageMinutes;
}

/**
 * Sort waiting tickets by current priority (desc), tiebroken by created_at (asc).
 * This mirrors the SQL `queue_view` ordering and is used for live client-side ordering.
 */
export function sortQueue<
  T extends Pick<TicketRow, "initial_priority" | "status" | "created_at">,
>(tickets: T[], now: number = Date.now()): T[] {
  return [...tickets].sort((a, b) => {
    const pa = computeCurrentPriority(a.initial_priority, a.status, a.created_at, now);
    const pb = computeCurrentPriority(b.initial_priority, b.status, b.created_at, now);
    if (pb !== pa) return pb - pa;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export async function fetchAllTickets(): Promise<TicketRow[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createTicket(input: {
  customer_name: string;
  description?: string;
  ticket_type: TicketType;
  initial_priority: number;
}): Promise<TicketRow> {
  const { data, error } = await supabase
    .from("tickets")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Push a ticket backward by one position in the waiting queue.
 * Implemented by lowering its initial_priority just enough so it falls behind
 * the ticket immediately after it. Enforces the 3-displacement cap.
 * Returns true on success, false if the cap was reached or no successor exists.
 */
export async function pushBackward(ticketId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const tickets = await fetchAllTickets();
  const waiting = sortQueue(tickets.filter((t) => t.status === "waiting"));
  const idx = waiting.findIndex((t) => t.id === ticketId);
  if (idx === -1) return { ok: false, reason: "Ticket not in waiting queue" };
  if (idx === waiting.length - 1) return { ok: false, reason: "Already last in queue" };

  const target = waiting[idx];
  if (target.displacement_count >= MAX_DISPLACEMENT) {
    return { ok: false, reason: `Reached displacement limit (${MAX_DISPLACEMENT})` };
  }

  const next = waiting[idx + 1];
  const now = Date.now();
  const nextPriority = computeCurrentPriority(
    next.initial_priority,
    next.status,
    next.created_at,
    now,
  );
  const targetAgeMin = (now - new Date(target.created_at).getTime()) / 60000;
  // Need: target.initial + age < nextPriority  =>  target.initial < nextPriority - age
  const newInitial = Math.floor(nextPriority - targetAgeMin - 0.1);

  const { error } = await supabase
    .from("tickets")
    .update({
      initial_priority: newInitial,
      displacement_count: target.displacement_count + 1,
    })
    .eq("id", ticketId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<void> {
  const { error } = await supabase
    .from("tickets")
    .update({ status })
    .eq("id", ticketId);
  if (error) throw error;
}

export function ticketTypeColor(t: TicketType): string {
  return t === "billing" ? "bg-warning/15 text-warning-foreground border-warning/40" : "bg-accent text-accent-foreground border-accent";
}

// ───────────────────────── Agents ─────────────────────────

export async function fetchAgents(): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAgent(input: {
  name: string;
  specialization: AgentSpecialization;
}): Promise<AgentRow> {
  const { data, error } = await supabase
    .from("agents")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setAgentStatus(
  agentId: string,
  status: AgentStatus,
): Promise<void> {
  const { error } = await supabase
    .from("agents")
    .update({ status })
    .eq("id", agentId);
  if (error) throw error;
}

export async function deleteAgent(agentId: string): Promise<void> {
  const { error } = await supabase.from("agents").delete().eq("id", agentId);
  if (error) throw error;
}

/** Assign the head-of-queue ticket to an available agent. RPC enforces specialization + queue order. */
export async function assignNextTicket(agentId: string): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase.rpc("assign_next_ticket", { p_agent_id: agentId });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function resolveTicket(ticketId: string): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase.rpc("resolve_ticket", { p_ticket_id: ticketId });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Send a heartbeat for a ticket (Module 4). */
export async function sendHeartbeat(ticketId: string): Promise<void> {
  await supabase
    .from("tickets")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", ticketId);
}

/** Trigger server-side reaper (Module 4). Idempotent + safe to call from clients. */
export async function reapInactive(): Promise<void> {
  await supabase.rpc("reap_inactive_tickets");
}

export function agentStatusColor(s: AgentStatus): string {
  if (s === "available") return "bg-success/15 text-success border-success/30";
  if (s === "busy") return "bg-warning/20 text-warning-foreground border-warning/40";
  return "bg-muted text-muted-foreground border-border";
}