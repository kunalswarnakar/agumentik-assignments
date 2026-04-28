-- Ticket type enum
CREATE TYPE public.ticket_type AS ENUM ('billing', 'technical');
CREATE TYPE public.ticket_status AS ENUM ('waiting', 'in_progress', 'resolved');

-- Tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  description TEXT,
  ticket_type public.ticket_type NOT NULL,
  initial_priority INTEGER NOT NULL DEFAULT 1,
  displacement_count INTEGER NOT NULL DEFAULT 0,
  status public.ticket_status NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_status_created ON public.tickets(status, created_at);

-- Effective priority: initial + 1 per minute waiting (only while waiting)
CREATE OR REPLACE FUNCTION public.effective_priority(
  p_initial INTEGER,
  p_status public.ticket_status,
  p_created_at TIMESTAMPTZ
) RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status = 'waiting'
      THEN p_initial + EXTRACT(EPOCH FROM (now() - p_created_at)) / 60.0
    ELSE p_initial
  END;
$$;

-- Queue view (ordered)
CREATE OR REPLACE VIEW public.queue_view AS
SELECT
  t.*,
  public.effective_priority(t.initial_priority, t.status, t.created_at) AS current_priority,
  ROW_NUMBER() OVER (
    ORDER BY
      public.effective_priority(t.initial_priority, t.status, t.created_at) DESC,
      t.created_at ASC
  ) AS queue_position
FROM public.tickets t
WHERE t.status = 'waiting';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: public read + insert (no auth required for this challenge)
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tickets"
  ON public.tickets FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update tickets"
  ON public.tickets FOR UPDATE
  USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;