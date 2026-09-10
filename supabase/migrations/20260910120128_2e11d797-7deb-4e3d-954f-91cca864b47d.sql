ALTER TYPE public.app_role RENAME TO cc_app_role;

ALTER FUNCTION private.has_role(uuid, public.cc_app_role) RENAME TO cc_has_role;

ALTER FUNCTION public.get_user_role(uuid) RENAME TO cc_get_user_role;

ALTER FUNCTION public.handle_new_user() RENAME TO cc_handle_new_user;

CREATE OR REPLACE FUNCTION public.cc_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin BOOLEAN;
  is_self BOOLEAN;
  user_nome TEXT;
  user_perfil TEXT;
BEGIN
  is_admin := lower(NEW.email) = 'desenvolvimento@escritoriologica.com.br';
  is_self := COALESCE(NEW.raw_user_meta_data->>'self_signup', 'false') = 'true';
  user_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  user_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'usuario');
  IF is_self THEN
    user_perfil := 'usuario';
  END IF;

  INSERT INTO public.cc_profiles (id, nome, email, must_change_password)
  VALUES (NEW.id, user_nome, NEW.email, NOT (is_admin OR is_self))
  ON CONFLICT (id) DO NOTHING;

  IF is_admin THEN
    INSERT INTO public.cc_user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.cc_user_roles (user_id, role) VALUES (
      NEW.id,
      CASE user_perfil
        WHEN 'admin' THEN 'admin'::public.cc_app_role
        WHEN 'coordenador' THEN 'coordenador'::public.cc_app_role
        WHEN 'lider' THEN 'lider'::public.cc_app_role
        ELSE 'usuario'::public.cc_app_role
      END
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cc_get_user_role(_user_id uuid)
 RETURNS public.cc_app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.cc_user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'coordenador' THEN 2
    WHEN 'lider' THEN 3
    WHEN 'usuario' THEN 4
  END
  LIMIT 1
$function$;