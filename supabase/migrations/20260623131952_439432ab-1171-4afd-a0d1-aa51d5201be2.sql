
-- Move has_role into a non-API-exposed schema so it cannot be invoked via PostgREST.
-- RLS policies continue to use it (they run in-database), while signed-in users
-- can no longer execute it through the Data API.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Rewrite policies to reference private.has_role
DROP POLICY IF EXISTS "Profiles self read" ON public.profiles;
CREATE POLICY "Profiles self read" ON public.profiles FOR SELECT
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Profiles self update" ON public.profiles;
CREATE POLICY "Profiles self update" ON public.profiles FOR UPDATE
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Profiles admin insert" ON public.profiles;
CREATE POLICY "Profiles admin insert" ON public.profiles FOR INSERT
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Roles self read" ON public.user_roles;
CREATE POLICY "Roles self read" ON public.user_roles FOR SELECT
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Analyses delete own" ON public.analyses;
CREATE POLICY "Analyses delete own" ON public.analyses FOR DELETE
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Analyses hierarchical read" ON public.analyses;
CREATE POLICY "Analyses hierarchical read" ON public.analyses FOR SELECT
  USING (
    (user_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR (private.has_role(auth.uid(), 'coordenador'::public.app_role) AND (private.has_role(user_id, 'lider'::public.app_role) OR private.has_role(user_id, 'usuario'::public.app_role)))
    OR (private.has_role(auth.uid(), 'lider'::public.app_role) AND private.has_role(user_id, 'usuario'::public.app_role))
  );

-- Drop the public-exposed function now that nothing references it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
