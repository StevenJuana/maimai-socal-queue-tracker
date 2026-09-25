-- Restrict table access to what the application actually uses. RLS remains
-- the row-level authorization boundary; grants provide table-level access.
REVOKE ALL ON TABLE public.locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.locations TO anon, authenticated;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

REVOKE ALL ON TABLE public.verification_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.verification_requests TO authenticated;

REVOKE ALL ON TABLE public.status_updates FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.status_updates TO authenticated;

-- Public clients must use the curated view; no client can read status history.
DROP POLICY IF EXISTS "public read status updates" ON public.status_updates;
DROP POLICY IF EXISTS "admins manage status updates" ON public.status_updates;

-- Only the current report for active locations, and only while it is fresh,
-- is exposed publicly. The underlying append-only history remains intact.
DROP VIEW IF EXISTS public.public_status_updates;
CREATE VIEW public.public_status_updates
WITH (security_invoker = false)
AS
SELECT
  l.name AS location_name,
  u.playing_count,
  u.queue_count,
  u.created_at,
  p.display_name
FROM (
  SELECT DISTINCT ON (location_id)
    location_id,
    playing_count,
    queue_count,
    created_at,
    user_id
  FROM public.status_updates
  ORDER BY location_id, created_at DESC, id DESC
) AS u
JOIN public.locations AS l ON l.id = u.location_id AND l.active
JOIN public.profiles AS p ON p.id = u.user_id
WHERE u.created_at > now() - interval '6 hours';

REVOKE ALL ON TABLE public.public_status_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_status_updates TO anon, authenticated;

-- The database timestamp is authoritative even if a direct API caller supplies
-- created_at. This trigger only runs for new rows; history is not rewritten.
CREATE OR REPLACE FUNCTION public.set_status_update_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS status_updates_set_created_at ON public.status_updates;
CREATE TRIGGER status_updates_set_created_at
BEFORE INSERT ON public.status_updates
FOR EACH ROW
EXECUTE FUNCTION public.set_status_update_created_at();

-- Users may submit or resubmit only their own pending request. Audit fields,
-- owner, status, and screenshot folder are set or checked at the DB boundary.
-- Admin review continues through the existing security-definer RPC.
CREATE OR REPLACE FUNCTION public.protect_verification_request_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  -- SQL Editor and trusted server-side roles have no end-user auth.uid().
  IF caller_id IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.user_id <> caller_id THEN
    RAISE EXCEPTION 'verification request owner cannot be changed';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.user_id <> caller_id THEN
    RAISE EXCEPTION 'verification request must belong to the signed-in user';
  END IF;
  IF split_part(NEW.screenshot_path, '/', 1) <> caller_id::text THEN
    RAISE EXCEPTION 'screenshot must be stored in the signed-in user folder';
  END IF;

  NEW.user_id := caller_id;
  NEW.status := 'pending';
  NEW.created_at := now();
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verification_requests_protect_fields ON public.verification_requests;
CREATE TRIGGER verification_requests_protect_fields
BEFORE INSERT OR UPDATE ON public.verification_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_verification_request_fields();
