-- Soft-remove status reports without deleting or rewriting their history.
ALTER TABLE public.status_updates
  ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;

UPDATE public.status_updates
SET is_removed = false
WHERE is_removed IS NULL;

ALTER TABLE public.status_updates
  ALTER COLUMN is_removed SET DEFAULT false,
  ALTER COLUMN is_removed SET NOT NULL;
COMMENT ON COLUMN public.status_updates.is_removed IS
  'True when an admin excludes this status from public display and analytics; the historical row is retained.';

-- Authenticated non-admins may never create a row already marked removed.
DROP POLICY IF EXISTS status_updates_removed_insert_guard ON public.status_updates;
CREATE POLICY status_updates_removed_insert_guard
  ON public.status_updates
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT is_removed OR public.is_admin());

-- Existing update restrictions from migration 006 limit authenticated table
-- updates to admins. This explicit restrictive policy keeps that protection
-- in place for status moderation without granting raw-table access.
DROP POLICY IF EXISTS status_updates_removed_update_guard ON public.status_updates;
CREATE POLICY status_updates_removed_update_guard
  ON public.status_updates
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin-only history lookup. This does not grant SELECT on the raw table to
-- public clients and returns no rows unless the caller is an administrator.
CREATE OR REPLACE FUNCTION public.admin_recent_status_updates()
RETURNS TABLE (
  status_id uuid,
  location_id uuid,
  location_name text,
  location_sort_order integer,
  playing_count integer,
  queue_count integer,
  created_at timestamptz,
  display_name text,
  is_test boolean,
  is_removed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ranked_updates AS (
    SELECT
      u.id AS status_id,
      u.location_id,
      l.name AS location_name,
      l.sort_order AS location_sort_order,
      u.playing_count,
      u.queue_count,
      u.created_at,
      u.user_id,
      u.is_test,
      u.is_removed,
      row_number() OVER (
        PARTITION BY u.location_id
        ORDER BY u.created_at DESC, u.id DESC
      ) AS location_rank
    FROM public.status_updates AS u
    JOIN public.locations AS l ON l.id = u.location_id
    WHERE l.active
  )
  SELECT
    r.status_id,
    r.location_id,
    r.location_name,
    r.location_sort_order,
    r.playing_count,
    r.queue_count,
    r.created_at,
    COALESCE(p.display_name, 'Deleted player'),
    r.is_test,
    r.is_removed
  FROM ranked_updates AS r
  LEFT JOIN public.profiles AS p ON p.id = r.user_id
  WHERE r.location_rank <= 10
    AND public.is_admin()
  ORDER BY r.location_sort_order, r.location_name, r.created_at DESC, r.status_id DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_recent_status_updates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_status_updates() TO authenticated;

-- Narrow soft-removal operation: the function checks the caller and changes
-- only is_removed. It cannot delete a row or rewrite its original report.
CREATE OR REPLACE FUNCTION public.admin_remove_status_update(target_status_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_rows integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.status_updates
  SET is_removed = true
  WHERE id = target_status_id
    AND is_removed = false;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_remove_status_update(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_status_update(uuid) TO authenticated;

-- Exclude removed rows before choosing the latest row per location. This lets
-- the next eligible update display while preserving the six-hour cutoff.
CREATE OR REPLACE VIEW public.public_status_updates
WITH (security_invoker = false)
AS
SELECT
  l.name AS location_name,
  u.playing_count,
  u.queue_count,
  u.created_at,
  COALESCE(p.display_name, 'Deleted player') AS display_name
FROM (
  SELECT DISTINCT ON (location_id)
    location_id,
    playing_count,
    queue_count,
    created_at,
    user_id
  FROM public.status_updates
  WHERE is_removed = false
  ORDER BY location_id, created_at DESC, id DESC
) AS u
JOIN public.locations AS l ON l.id = u.location_id AND l.active
LEFT JOIN public.profiles AS p ON p.id = u.user_id
WHERE u.created_at > now() - interval '6 hours';
