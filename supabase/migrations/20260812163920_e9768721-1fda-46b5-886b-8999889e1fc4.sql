CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.profiles (id, nome, email, must_change_password)
  VALUES (NEW.id, user_nome, NEW.email, NOT (is_admin OR is_self))
  ON CONFLICT (id) DO NOTHING;

  IF is_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (
      NEW.id,
      CASE user_perfil
        WHEN 'admin' THEN 'admin'::public.app_role
        WHEN 'coordenador' THEN 'coordenador'::public.app_role
        WHEN 'lider' THEN 'lider'::public.app_role
        ELSE 'usuario'::public.app_role
      END
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;