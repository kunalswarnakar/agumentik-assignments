-- Module 2: Agents
CREATE TYPE public.agent_specialization AS ENUM ('billing', 'technical');
CREATE TYPE public.agent_status AS ENUM ('available', 'busy', 'offline');

CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialization public.agent_specialization NOT NULL,
  status public.agent_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert agents" ON public.agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update agents" ON public.agents FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete agents" ON public.agents FOR DELETE USING (true);

CREATE TRIGGER agents_updated_at BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add expired status + heartbeat + assigned_agent to tickets
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now();

-- Recreate queue_view to include new columns
DROP VIEW IF EXISTS public.queue_view;
CREATE VIEW public.queue_view
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.customer_name,
  t.description,
  t.ticket_type,
  t.initial_priority,
  t.displacement_count,
  t.status,
  t.created_at,
  t.updated_at,
  t.assigned_agent_id,
  t.last_heartbeat,
  public.effective_priority(t.initial_priority, t.status, t.created_at) AS current_priority,
  ROW_NUMBER() OVER (
    ORDER BY public.effective_priority(t.initial_priority, t.status, t.created_at) DESC,
             t.created_at ASC
  ) AS queue_position
FROM public.tickets t
WHERE t.status = 'waiting';

-- Module 4: heartbeat reaper. Inactive = no heartbeat for 30 seconds.
CREATE OR REPLACE FUNCTION public.reap_inactive_tickets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reaped INTEGER;
BEGIN
  UPDATE public.tickets
  SET status = 'expired'
  WHERE status IN ('waiting', 'in_progress')
    AND last_heartbeat < (now() - interval '30 seconds');
  GET DIAGNOSTICS reaped = ROW_COUNT;
  RETURN reaped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reap_inactive_tickets() TO anon, authenticated;

-- Module 2: routing-aware assignment. Assign next ticket to a given agent only
-- if that agent's specialization matches the head-of-queue ticket type.
-- If head-of-queue ticket type cannot be served by ANY available agent,
-- the head ticket waits and other tickets cannot bypass it.
CREATE OR REPLACE FUNCTION public.assign_next_ticket(p_agent_id UUID)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents;
  v_head public.tickets;
  v_servable BOOLEAN;
  v_result public.tickets;
BEGIN
  SELECT * INTO v_agent FROM public.agents WHERE id = p_agent_id;
  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;
  IF v_agent.status <> 'available' THEN
    RAISE EXCEPTION 'Agent is not available';
  END IF;

  -- Get head-of-queue waiting ticket
  SELECT * INTO v_head
  FROM public.tickets
  WHERE status = 'waiting'
  ORDER BY public.effective_priority(initial_priority, status, created_at) DESC,
           created_at ASC
  LIMIT 1;

  IF v_head.id IS NULL THEN
    RAISE EXCEPTION 'Queue is empty';
  END IF;

  -- Routing rule: head ticket must match this agent's specialization.
  -- Other tickets cannot bypass even if this agent could serve them.
  IF v_head.ticket_type::text <> v_agent.specialization::text THEN
    -- Check whether ANY available agent matches the head ticket
    SELECT EXISTS (
      SELECT 1 FROM public.agents
      WHERE status = 'available'
        AND specialization::text = v_head.ticket_type::text
    ) INTO v_servable;

    IF v_servable THEN
      RAISE EXCEPTION 'Head of queue is a % ticket; wait for a matching agent', v_head.ticket_type;
    ELSE
      RAISE EXCEPTION 'Head of queue requires a % agent (none available). Queue is blocked until one comes online.', v_head.ticket_type;
    END IF;
  END IF;

  UPDATE public.tickets
  SET status = 'in_progress',
      assigned_agent_id = p_agent_id
  WHERE id = v_head.id
  RETURNING * INTO v_result;

  UPDATE public.agents SET status = 'busy' WHERE id = p_agent_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_next_ticket(UUID) TO anon, authenticated;

-- Resolve ticket and free agent
CREATE OR REPLACE FUNCTION public.resolve_ticket(p_ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT assigned_agent_id INTO v_agent_id FROM public.tickets WHERE id = p_ticket_id;
  UPDATE public.tickets SET status = 'resolved' WHERE id = p_ticket_id;
  IF v_agent_id IS NOT NULL THEN
    UPDATE public.agents SET status = 'available' WHERE id = v_agent_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_ticket(UUID) TO anon, authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;