CREATE OR REPLACE FUNCTION public.create_pending_staff_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requested_role text := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_user_meta_data ->> 'signup_role'
  );
  requested_name text := btrim(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'signup_name'
  ));
  requested_union text := COALESCE(
    NEW.raw_user_meta_data ->> 'union_id',
    NEW.raw_user_meta_data ->> 'signup_union_id'
  );
  requested_upazila text := COALESCE(
    NEW.raw_user_meta_data ->> 'upazila_id',
    'manirampur'
  );
  requested_phone text := COALESCE(
    NEW.phone,
    NEW.raw_user_meta_data ->> 'phone_number'
  );
  requested_email text := COALESCE(
    NEW.email,
    NEW.raw_user_meta_data ->> 'dummy_email'
  );
BEGIN
  IF requested_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF requested_role NOT IN ('worker', 'police', 'admin')
    OR requested_name IS NULL
    OR length(requested_name) NOT BETWEEN 1 AND 100
    OR requested_union IS NULL
    OR requested_upazila <> 'manirampur'
    OR (requested_role IN ('worker', 'police') AND requested_phone IS NULL)
    OR (requested_role = 'admin' AND NEW.email IS NULL)
  THEN
    RAISE EXCEPTION 'Invalid staff registration details';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.upazilas AS upazila
    CROSS JOIN LATERAL jsonb_array_elements(upazila.unions) AS station
    WHERE upazila.id = requested_upazila
      AND station ->> 'id' = requested_union
      AND requested_union <> 'mn-pourashava'
  ) THEN
    RAISE EXCEPTION 'Invalid staff registration union';
  END IF;

  INSERT INTO public.profiles (
    id, name_bn, name_en, mobile, email, upazila_id, union_id, ward, active, status
  ) VALUES (
    NEW.id,
    requested_name,
    requested_name,
    requested_phone,
    requested_email,
    requested_upazila,
    requested_union,
    CASE WHEN requested_role IN ('worker', 'police') THEN 1 ELSE NULL END,
    false,
    'pending'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, requested_role::public.app_role);

  RETURN NEW;
END;
$$;
