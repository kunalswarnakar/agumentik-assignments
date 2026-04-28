-- Fix function search paths
CREATE OR REPLACE FUNCTION public.effective_priority(
  p_initial INTEGER,
  p_status public.ticket_status,
  p_created_at TIMESTAMPTZ
) RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status = 'waiting'
      THEN p_initial + EXTRACT(EPOCH FROM (now() - p_created_at)) / 60.0
    ELSE p_initial
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Recreate view with security_invoker
DROP VIEW IF EXISTS public.queue_view;
CREATE VIEW public.queue_view
WITH (security_invoker = true) AS
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