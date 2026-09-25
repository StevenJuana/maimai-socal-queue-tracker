-- Give every existing and future profile a case-insensitively unique login username.
-- The Auth email remains an internal Supabase identifier and is never copied to UI output.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.email IS NULL
       OR regexp_replace(u.email, '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
  ) THEN
    RAISE EXCEPTION 'Username backfill stopped: an Auth user has no usable email';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    GROUP BY lower(regexp_replace(u.email, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Username backfill stopped: normalized Auth emails are duplicated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    LEFT JOIN auth.users AS u ON u.id = p.id
    WHERE u.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM auth.users AS u
    LEFT JOIN public.profiles AS p ON p.id = u.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Username backfill stopped: Auth users and profiles do not match one-to-one';
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN username text;

UPDATE public.profiles AS p
SET username = u.email
FROM auth.users AS u
WHERE u.id = p.id;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL,
  ADD CONSTRAINT profiles_username_normalized_length_check
    CHECK (
      char_length(lower(regexp_replace(username, '^[[:space:]]+|[[:space:]]+$', '', 'g'))) BETWEEN 1 AND 255
    );

CREATE UNIQUE INDEX profiles_username_normalized_uidx
  ON public.profiles (
    lower(regexp_replace(username, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
  );

-- Keep existing role/verification protections and make usernames immutable to
-- all authenticated users, including admins. Trusted migrations may backfill them.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Usernames cannot be changed';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = auth.uid() AND p.role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Only administrators may change role';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = auth.uid() AND p.role = 'admin'
     )
     AND NOT (
       OLD.id = auth.uid()
       AND OLD.verification_status = 'rejected'
       AND NEW.verification_status = 'pending'
       AND EXISTS (
         SELECT 1 FROM public.verification_requests AS r
         WHERE r.user_id = OLD.id AND r.status = 'pending'
       )
     ) THEN
    RAISE EXCEPTION 'Only administrators may change verification status';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- New application registrations send username metadata; older/manual Auth
-- registrations with a routable email retain that email as their username.
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  initial_username text;
BEGIN
  initial_username := NULLIF(
    regexp_replace(
      COALESCE(NEW.raw_user_meta_data ->> 'username', ''),
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    ),
    ''
  );

  IF initial_username IS NULL THEN
    IF NEW.email IS NULL OR lower(NEW.email) LIKE '%@auth.maimai.invalid' THEN
      RAISE EXCEPTION 'Username metadata is required for an internal Auth account';
    END IF;
    initial_username := NEW.email;
  END IF;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    initial_username,
    COALESCE(NULLIF(left(trim(NEW.raw_user_meta_data ->> 'display_name'), 40), ''), 'Player')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Only the server-only service-role client may resolve a username to an Auth
-- UUID. The Auth email is retrieved separately through auth.admin.getUserById.
CREATE OR REPLACE FUNCTION public.resolve_auth_user_id_for_username(candidate_username text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.profiles AS p
  WHERE lower(regexp_replace(p.username, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
      = lower(regexp_replace(candidate_username, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_auth_user_id_for_username(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_auth_user_id_for_username(text)
  TO service_role;

COMMIT;
