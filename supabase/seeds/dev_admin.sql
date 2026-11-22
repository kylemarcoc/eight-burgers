-- LOCAL DEVELOPMENT ONLY — NEVER RUN AGAINST STAGING OR PRODUCTION!
-- Seeds a deterministic local owner admin account:
--   Email:    owner@eightburgers.local
--   Password: EightBurgersDev123!

do $$
declare
  v_admin_id uuid := '11111111-1111-4111-8111-111111111111';
  v_email text := 'owner@eightburgers.local';
  v_password text := 'EightBurgersDev123!';
begin
  if not exists (select 1 from auth.users where id = v_admin_id or email = v_email) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Eight Burgers Owner"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', v_email, 'email_verified', true),
      'email',
      v_admin_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.admin_users (user_id, email, role, active)
  select id, email, 'owner', true
  from auth.users
  where email = v_email
  on conflict (user_id) do update
    set active = true, role = excluded.role;
end;
$$;
