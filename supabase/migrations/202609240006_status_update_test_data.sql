-- Preserve all existing status history and mark the rows present at migration
-- time as test data. The column-existence check keeps reruns from relabeling
-- real rows submitted after this migration was first applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'status_updates'
      AND column_name = 'is_test'
  ) THEN
    ALTER TABLE public.status_updates
      ADD COLUMN is_test boolean NOT NULL DEFAULT false;
    UPDATE public.status_updates SET is_test = true;
  END IF;
END;
$$;

-- Keep the intended default and repair any nullable rows from an interrupted
-- manual application without changing rows already classified as real/test.
UPDATE public.status_updates
SET is_test = true
WHERE is_test IS NULL;

ALTER TABLE public.status_updates
  ALTER COLUMN is_test SET DEFAULT false,
  ALTER COLUMN is_test SET NOT NULL;

-- These restrictive guards are ANDed with existing permissive policies:
-- approved users can still submit their own real updates, while only admins
-- can insert test rows or update status rows.
DROP POLICY IF EXISTS status_updates_test_insert_guard ON public.status_updates;
CREATE POLICY status_updates_test_insert_guard
  ON public.status_updates
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT is_test OR public.is_admin());

DROP POLICY IF EXISTS status_updates_test_update_guard ON public.status_updates;
CREATE POLICY status_updates_test_update_guard
  ON public.status_updates
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin test submissions use the normal authenticated Supabase client. This
-- explicit permissive policy preserves admin inserts alongside the guard.
DROP POLICY IF EXISTS admins_insert_test_status_updates ON public.status_updates;
CREATE POLICY admins_insert_test_status_updates
  ON public.status_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());
