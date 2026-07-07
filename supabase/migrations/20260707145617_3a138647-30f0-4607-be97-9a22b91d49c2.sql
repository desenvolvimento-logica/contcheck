DROP POLICY IF EXISTS "Profiles self read" ON public.profiles;
CREATE POLICY "Profiles hierarchical read" ON public.profiles FOR SELECT
USING (
  id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR (private.has_role(auth.uid(), 'coordenador'::app_role) AND (private.has_role(id, 'lider'::app_role) OR private.has_role(id, 'usuario'::app_role)))
  OR (private.has_role(auth.uid(), 'lider'::app_role) AND private.has_role(id, 'usuario'::app_role))
);

DROP POLICY IF EXISTS "Roles self read" ON public.user_roles;
CREATE POLICY "Roles hierarchical read" ON public.user_roles FOR SELECT
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR (private.has_role(auth.uid(), 'coordenador'::app_role) AND (private.has_role(user_id, 'lider'::app_role) OR private.has_role(user_id, 'usuario'::app_role)))
  OR (private.has_role(auth.uid(), 'lider'::app_role) AND private.has_role(user_id, 'usuario'::app_role))
);