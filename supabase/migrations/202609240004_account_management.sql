-- Enforce display-name uniqueness independent of case and surrounding spaces.
-- Existing normalized duplicates and whitespace-only names must be resolved
-- before applying this migration.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_normalized_length_check
  CHECK (
    char_length(lower(regexp_replace(display_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))) BETWEEN 1 AND 40
  );

CREATE UNIQUE INDEX profiles_display_name_normalized_uidx
  ON public.profiles (lower(regexp_replace(display_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')));

-- Return only whether a requested name is available; never expose profile rows.
CREATE OR REPLACE FUNCTION public.is_display_name_available(candidate_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT candidate_name IS NOT NULL
    AND char_length(lower(regexp_replace(candidate_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))) BETWEEN 1 AND 40
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE lower(regexp_replace(p.display_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
        = lower(regexp_replace(candidate_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    );
$$;
REVOKE ALL ON FUNCTION public.is_display_name_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_display_name_available(text) TO anon, authenticated;

-- Preserve status history when auth.users cascades to profiles on account deletion.
ALTER TABLE public.status_updates
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.status_updates
  DROP CONSTRAINT IF EXISTS status_updates_user_id_fkey,
  ADD CONSTRAINT status_updates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_reviewed_by_fkey,
  ADD CONSTRAINT verification_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Retain the hardened public view contract and six-hour freshness rule while
-- keeping historical status rows visible after their author profile is deleted.
DROP VIEW IF EXISTS public.public_status_updates;
CREATE VIEW public.public_status_updates
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
  ORDER BY location_id, created_at DESC, id DESC
) AS u
JOIN public.locations AS l ON l.id = u.location_id AND l.active
LEFT JOIN public.profiles AS p ON p.id = u.user_id
WHERE u.created_at > now() - interval '6 hours';

REVOKE ALL ON TABLE public.public_status_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_status_updates TO anon, authenticated;
