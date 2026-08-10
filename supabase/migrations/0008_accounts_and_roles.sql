-- Accounts, and what an account is allowed to be.
--
-- Until now every driver was an anonymous row in `auth.users`, created on the
-- first read by `currentReporterId`. That was the right default and stays the
-- default: asking somebody to make an account before they may photograph a
-- blocked pavement is how a community map gets no reports at all. What was
-- missing is everything after it -- a way to keep the account when the phone
-- is replaced, and a way to say that this particular person is a sector hall
-- rather than a driver.
--
-- WHY UPGRADING LOSES NOTHING, which is the whole point of the issue this
-- migration closes. `supabase.auth.updateUser({ email })` on an anonymous user
-- does not create a second user and copy anything across: it attaches an email
-- to the row that is already there, and `auth.users.id` never changes. Every
-- foreign key in this schema -- `reports.created_by`, `report_events.actor`,
-- `spots.owner_id`, `availability_windows.owner_id` -- and every storage path
-- under `report-photos/<uuid>/` therefore keeps pointing at the same person.
-- There is no migration of rows here because there is nothing to migrate, and
-- that is a property of the design rather than a happy accident: any scheme
-- that minted a new uuid on sign-up would have to rewrite six tables and a
-- bucket, and would silently orphan whatever it forgot.
--
-- TWO TABLES, AND THEY ARE NOT THE SAME KIND OF THING.
--
--   `profiles` is what a person says about themselves. They write it, it is
--   public, and nothing in it is trusted.
--
--   `user_roles` is what the project says about them. They cannot write it at
--   all -- see the revoke below, which is the load-bearing line in this file --
--   and everything in it is trusted.
--
-- Keeping them apart is what makes "no user can grant themselves a privileged
-- role" a fact about the grants rather than a promise made by a policy that
-- somebody may later loosen.

-- ---------------------------------------------------------------------------
-- The roles
-- ---------------------------------------------------------------------------
--
-- An enum rather than a text column with a check, because these names are read
-- by `has_role` below, by `AccountRole` in types/index.ts and eventually by
-- whoever grants one by hand in the dashboard. A typo in any of those should
-- be an error at the point it is written, not a role that silently never
-- matches.
--
-- `user` is in the type and is deliberately *not* storable: see the check on
-- the table. Everybody who is signed in is a user, so a row saying so would
-- carry no information, and its absence would be ambiguous in the one place it
-- matters -- an account with no rows would then mean either "an ordinary
-- driver" or "somebody whose baseline grant was forgotten".

do $$
begin
  create type public.account_role as enum (
    -- Anybody signed in, including anonymously. Files reports, searches, parks.
    'user',
    -- Lists a parking space they have a right to. Verification is #17's job;
    -- this is only the flag that says the app should ask for it.
    'host',
    -- A sector hall, a warden, a moderator: entitled to see evidence and to
    -- close a complaint. Institutional verification is #12's job.
    'resolver',
    -- Runs the project.
    'admin'
  );
exception
  when duplicate_object then null;
end
$$;

/**
 * Whether a role carries authority over somebody else's data.
 *
 * The line is not seniority, it is blast radius. A host acts on their own
 * property and can hurt only themselves; a resolver reads number plates
 * belonging to strangers and closes their complaints, and an admin can do it
 * to everybody. The two below are the ones a stolen phone must not be enough
 * to use, which is why `has_role` demands a second factor for exactly this set.
 */
create or replace function public.is_privileged_role(candidate public.account_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate in ('resolver', 'admin')
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
--
-- One row per account, created by a trigger rather than by the client, so that
-- there is no window in which a user exists and their profile does not.
--
-- NOTHING PRIVATE GOES IN THIS TABLE. It is readable by everybody on purpose --
-- a listing has to be able to say whose it is, and a trader has to be
-- identifiable as one before somebody pays them -- so the email, the phone and
-- the second-factor enrolment stay where Supabase put them, in `auth`, which is
-- not exposed through the API at all. Adding a column here is therefore a
-- decision to publish it.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- What to call them on screen. Null until they say; the app shows "Șofer".
  -- Trimmed length rather than raw, or a name of forty spaces would pass.
  display_name text check (
    display_name is null
    or length(btrim(display_name)) between 2 and 60
  ),

  /**
   * Whether they say they are acting commercially.
   *
   * Self-declared, and that is all it is worth today: it is a statement of
   * intent by the person who benefits from getting it wrong. It is recorded
   * anyway because the obligation attaches at the moment of the declaration --
   * a trader owes a consumer withdrawal rights, an identity and an address --
   * and an app that never asked would have no way to tell the two kinds of
   * host apart when #21 and #22 make it enforceable.
   */
  is_trader boolean not null default false,
  -- When the current answer was given, stamped by the trigger below rather
  -- than by the client. A declaration is a dated act, and the date is the part
  -- a client has an interest in misreporting.
  trader_declared_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'What a person says about themselves. Public, and trusted by nobody.';

-- Everybody who already exists. `signInAnonymously` has been minting users
-- since 0001, so without this the app would run against accounts with no
-- profile row until each of them next signed in -- which for an anonymous user
-- whose session is already stored is never.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

/** Give every new account a profile, including an anonymous one. */
create or replace function public.give_a_new_user_a_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.give_a_new_user_a_profile();

/**
 * What a person may change about themselves, and what only the server may.
 *
 * The client sends `display_name` and `is_trader` and nothing else. The rest is
 * refused here rather than merely omitted from the typed patch in
 * `types/database.ts`, because a type is a promise this client makes and this
 * is the one that holds for any client -- including a hand-rolled request with
 * `created_at` set to next year to look like a long-standing account.
 */
create or replace function public.refuse_rewriting_a_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'A profile''s identity and age cannot be edited'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Stamped, not accepted. Only a change of answer moves the date, so a
  -- profile saved twice does not look like the declaration was made twice.
  if new.is_trader is distinct from old.is_trader then
    new.trader_declared_at := now();
  else
    new.trader_declared_at := old.trader_declared_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_are_edited_not_rewritten on public.profiles;
create trigger profiles_are_edited_not_rewritten
  before update on public.profiles
  for each row execute function public.refuse_rewriting_a_profile();

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
--
-- A table rather than a column on `profiles`, for two reasons. A person can be
-- both a host and a resolver -- the warden who also rents out their garage is
-- an ordinary case, not an edge one -- and a column would force a hierarchy
-- onto four things that are not ordered. And a grant is an event with an author
-- and a date, which a column has nowhere to put.

create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.account_role not null,

  -- `user` is what you are for being signed in; there is nothing to grant.
  constraint user_roles_grants_are_above_the_baseline check (role <> 'user'),

  -- Who granted it. Null for a grant made out of band -- through the dashboard,
  -- or by a migration -- which is how every grant is made today: there is no
  -- interface for it, deliberately, and there will not be one until #12 defines
  -- what verifying an institution actually means.
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  -- Why, in words. A resolver grant should be traceable to the paperwork that
  -- justified it, and "we thought they were the sector hall" is not a record.
  note text,

  primary key (user_id, role)
);

comment on table public.user_roles is
  'What the project says about a person. No client may write it; see the revoke.';

create index if not exists user_roles_by_role_idx on public.user_roles (role);

/**
 * An anonymous account may not hold a role.
 *
 * `has_role` already refuses one, so this is the belt to that pair of braces,
 * and it is worth having as a constraint rather than only as a check at read
 * time: a role granted to an anonymous user is a grant that can never be
 * exercised and can never be revoked by its holder, because nobody can prove
 * they are that user. It should not be possible to create one by hand at three
 * in the morning through the dashboard.
 */
create or replace function public.refuse_a_role_for_a_ghost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select u.is_anonymous from auth.users u where u.id = new.user_id) then
    raise exception
      'An anonymous account cannot hold the % role; it must be upgraded first',
      new.role
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_need_a_real_account on public.user_roles;
create trigger user_roles_need_a_real_account
  before insert or update on public.user_roles
  for each row execute function public.refuse_a_role_for_a_ghost();

-- ---------------------------------------------------------------------------
-- Asking what somebody is
-- ---------------------------------------------------------------------------

/**
 * How strongly the current session is authenticated.
 *
 * `aal1` is a password. `aal2` is a password and a second factor, and Supabase
 * puts it in the token the moment the challenge is passed. Absent means aal1:
 * an old token, or an anonymous session, and both should read as the weaker
 * answer rather than as an error.
 */
create or replace function public.current_assurance_level()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt() ->> 'aal', ''), 'aal1')
$$;

/** Whether the current session belongs to somebody who never signed up. */
create or replace function public.is_anonymous_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

/**
 * Whether the caller holds a role, right now, on this session.
 *
 * The one place the rule lives, so that a policy written in six months cannot
 * express a subtly different version of it. Three things have to be true and
 * the last two are what the issue is about:
 *
 *   1. The grant exists.
 *   2. The session is not anonymous. An anonymous user is a session, not a
 *      person: anybody holding the phone is them, and nobody can recover them.
 *   3. For `resolver` and `admin`, the session has passed a second factor.
 *      Not the *account* -- the session. An admin who enrolled a factor and
 *      then signed in with only a password is at `aal1`, and the whole value
 *      of the requirement is that a stolen password is not enough at the
 *      moment the request is made.
 *
 * `security definer` because it reads `user_roles`, which callers may only read
 * for themselves; the function is what lets a policy ask about the caller
 * without the table having to be legible to them.
 */
create or replace function public.has_role(wanted public.account_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    -- Everybody signed in, anonymous included. This is the baseline that
    -- reports and windows already check for, so it must not start demanding
    -- an account: it would lock every existing driver out of their own data.
    when wanted = 'user' then true
    when public.is_anonymous_session() then false
    when public.is_privileged_role(wanted)
      and public.current_assurance_level() <> 'aal2' then false
    else exists (
      select 1
      from public.user_roles r
      where r.user_id = (select auth.uid())
        and r.role = wanted
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Dropped before each create, like the triggers above, so the whole file can be
-- run again against a project that already has it. `create policy` has no
-- `if not exists`, and a migration that fails halfway through on its second run
-- is one somebody has to unpick by hand.


drop policy if exists "A profile is readable by everybody" on public.profiles;
create policy "A profile is readable by everybody"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- No insert policy. The trigger on `auth.users` creates the row, and a client
-- that could insert one could invent a profile for somebody else's uuid before
-- they ever signed in.
drop policy if exists "A person edits their own profile" on public.profiles;
create policy "A person edits their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy either: a profile goes when the account does, by cascade.
-- Deleting the account is #9's business, and it is a different act from
-- blanking a display name.

drop policy if exists "You may see what you have been granted" on public.user_roles;
create policy "You may see what you have been granted"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()));

-- An admin has to be able to see who holds what, or a mistaken grant is
-- invisible to the only people who can undo it. Through `has_role`, so it
-- costs a second factor like everything else an admin does.
drop policy if exists "An admin sees every grant" on public.user_roles;
create policy "An admin sees every grant"
  on public.user_roles for select
  to authenticated
  using (public.has_role('admin'));

-- No insert, update or delete policy, and none is coming. See the revoke.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;

-- The row is made by the trigger on `auth.users`, and it goes when the account
-- does. A client that could insert one could invent a profile for a uuid that
-- has not signed up yet; one that could delete one could erase a trader
-- declaration the moment it became inconvenient. Both are refused by the
-- absence of a policy today, and revoked here so that adding a policy later
-- cannot quietly re-open them.
revoke insert, delete on public.profiles from anon, authenticated;

/**
 * THE LINE THAT MAKES ROLES SAFE.
 *
 * Supabase's default privileges grant every right on every new table in
 * `public` to `anon` and `authenticated`, so a table is writable by the app's
 * shipped anon key unless somebody says otherwise; row level security then
 * decides which rows. `user_roles` has no write policy, so today RLS alone
 * would refuse every write -- and that is exactly the kind of protection that
 * evaporates the afternoon somebody adds a policy for a reason that looks good
 * at the time.
 *
 * Revoking the privilege takes the question away from the policy layer
 * entirely: PostgREST cannot write this table on behalf of a driver whatever
 * any future policy says, because the role it connects as has no such right.
 * Grants are made by `service_role`, which bypasses all of this, and there is
 * no path from the app to `service_role` -- that key never ships in a client.
 */
revoke insert, update, delete on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

grant execute on function public.has_role(public.account_role) to anon, authenticated;
grant execute on function public.current_assurance_level() to anon, authenticated;
grant execute on function public.is_anonymous_session() to anon, authenticated;
grant execute on function public.is_privileged_role(public.account_role) to anon, authenticated;
