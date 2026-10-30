ALTER TABLE public.profiles
  ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'rejected'));

UPDATE public.profiles
SET status = CASE WHEN active THEN 'active' ELSE 'pending' END;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_matches_status
  CHECK (active = (status = 'active'));

CREATE INDEX profiles_pending_union_idx
  ON public.profiles (upazila_id, union_id, created_at)
  WHERE status = 'pending';
