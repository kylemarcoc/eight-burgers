-- LOCAL DEVELOPMENT ONLY — NEVER RUN AGAINST STAGING OR PRODUCTION!
-- Seeds deterministic local Staff Portal accounts (all share password: EightBurgersDev123!):
--   Owner:   owner@eightburgers.local   (role = 'owner')
--   Cashier: cashier@eightburgers.local (role = 'cashier')
--   Staff:   staff@eightburgers.local   (role = 'staff')

do $$
declare
  v_password text := 'EightBurgersDev123!';
  v_account record;
begin
  for v_account in
    select *
    from (
      values
        (
          '11111111-1111-4111-8111-111111111111'::uuid,
          'owner@eightburgers.local',
          'owner',
          'Eight Burgers Owner'
        ),
        (
          '22222222-2222-4222-8222-222222222222'::uuid,
          'cashier@eightburgers.local',
          'cashier',
          'Eight Burgers Cashier'
        ),
        (
          '33333333-3333-4333-8333-333333333333'::uuid,
          'staff@eightburgers.local',
          'staff',
          'Eight Burgers Staff'
        )
    ) as accounts(user_id, email, app_role, display_name)
  loop
    if not exists (
      select 1
      from auth.users
      where id = v_account.user_id
         or email = v_account.email
    ) then
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
        v_account.user_id,
        'authenticated',
        'authenticated',
        v_account.email,
        extensions.crypt(v_password, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', v_account.display_name),
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
        v_account.user_id,
        jsonb_build_object(
          'sub', v_account.user_id::text,
          'email', v_account.email,
          'email_verified', true
        ),
        'email',
        v_account.user_id::text,
        now(),
        now(),
        now()
      );
    end if;

    insert into public.admin_users (user_id, email, role, active)
    select id, email, v_account.app_role, true
    from auth.users
    where email = v_account.email
    on conflict (user_id) do update
      set active = true, role = excluded.role;
  end loop;
end;
$$;
