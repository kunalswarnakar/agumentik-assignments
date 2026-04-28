import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAgents,
  fetchAllTickets,
  reapInactive,
  sortQueue,
  type AgentRow,
  type TicketRow,
} from "@/lib/queue";

/**
 * Subscribes to tickets table changes and re-ticks every second so
 * priority/queue position update live as tickets age.
 */
export function useLiveTickets() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllTickets(), fetchAgents()])
      .then(([t, a]) => {
        if (cancelled) return;
        setTickets(t);
        setAgents(a);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const channel = supabase
      .channel("tickets-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => {
          fetchAllTickets().then((rows) => {
            if (!cancelled) setTickets(rows);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents" },
        () => {
          fetchAgents().then((rows) => {
            if (!cancelled) setAgents(rows);
          });
        },
      )
      .subscribe();

    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    // Module 4: trigger server-side reaper every 5s so inactive tickets vanish.
    const reaper = setInterval(() => {
      reapInactive().catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(reaper);
      supabase.removeChannel(channel);
    };
  }, []);

  const waiting = sortQueue(tickets.filter((t) => t.status === "waiting"));
  const inProgress = tickets.filter((t) => t.status === "in_progress");
  const resolved = tickets.filter((t) => t.status === "resolved");
  const expired = tickets.filter((t) => t.status === "expired");

  return { tickets, agents, waiting, inProgress, resolved, expired, loading, tick };
}