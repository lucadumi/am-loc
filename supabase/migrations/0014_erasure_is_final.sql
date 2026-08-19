-- Erasure is final
--
-- An erasure is not one moment. `erase_me` in `0012` deletes the rows in a
-- single transaction; the photographs and the login go on a later run of the
-- job in `0013`, a night or two away; and the tokens outlive both.
-- `abandonErasedSession` in `lib/account.ts` signs the telephone out, and
-- supabase-js signs out globally by default, so it asks for every refresh token
-- that account has to be revoked -- and swallows the error if the ask fails,
-- deliberately, because the rows are already gone by then. Access tokens are
-- not revocable at all: they are signed statements with an expiry on them,
-- nothing consults a list, and one already issued keeps opening the API until
-- it runs out -- an hour, on the default. On this telephone, and on any other
-- that was signed in and has not been touched since.
--
-- In that gap every write policy in this schema still said yes. `0013` closed
-- the half of it that mattered most, and the comment above its storage
-- policies is the argument for this file too: a photograph that arrives after
-- the sweep outlives the account it belonged to. The bucket was never the only
-- thing accepting writes.
--
-- WHAT SURVIVES THE LOGIN. Most tables here hang off `auth.users` with `on
-- delete cascade`, so a report filed in the gap goes when the login goes and
-- what leaked was a few hours of a public complaint under a dead uuid. Two do
-- not:
--
--   * `spots` is `on delete set null` on both `owner_id` and `created_by`
--     (`0001`), and `owner_name` is plain text that no cascade touches. A kerb
--     added in the gap with a name on it keeps the name after the login goes,
--     publicly, with nothing left pointing at who it belonged to. A private
--     spot added in the gap is worse in a different way: `0010` requires it to
--     have an owner, so `set null` cannot run and the `auth.users` delete
--     fails outright -- see the second pass below.
--   * `report_events.actor` was made `set null` in `0012` so that what was
--     done about a report survives the person who did it. That is right for
--     the rows already there. It is not a thing to be able to add to.
--
-- Rather than sort the tables into those two lists -- a sorting that is one new
-- table away from being wrong, and that quietly makes it the next migration's
-- job to notice -- the rule here is the blunt one: a request to be forgotten
-- stops the writing.
--
-- WHAT IT DOES NOT STOP. Reading, and deleting. Somebody mid-erasure may still
-- read what is left of their account and still delete their own rows, because
-- deleting goes the same way the erasure is already going, and because the
-- screens that do it are the ones showing them what is happening.
-- `export_my_data` keeps working for the same reason: the receipt is theirs,
-- and it is most worth having at exactly this moment.
--
-- And one thing it cannot stop, which is why it is not the whole answer. An
-- upload is authorised when it starts, and a signed upload URL when it is
-- minted -- two hours before it is used, on Supabase's figure. A write
-- authorised in the moment before the button was pressed cannot be called
-- back by any policy written here. What deals with that is not a refusal but a
-- wait: `pending_erasures()` below holds a request back for three hours, so
-- that by the time anything is swept there is nothing left in the air.

/**
 * Whether the caller has asked to be forgotten.
 *
 * The one place the rule lives, so that the eleven policies below cannot drift
 * into eleven slightly different versions of it, and so that the bucket and the
 * tables cannot come to mean different things by it.
 *
 * Any request counts, open or closed. A closed one means the login is gone,
 * and a token issued before it went can still arrive: the API checks a
 * signature and an expiry, not a list of accounts. So a closed request has to
 * refuse writes too, and a barrier that had to reason about which half of an
 * erasure has finished would be a barrier with a hole in it.
 *
 * `security definer` for a reason worth stating, because `0013` inlined this
 * check instead and it looked equivalent: read as the caller, the check leans
 * on `A person sees their own erasure request` in `0012` still being there and
 * still being that wide. A policy that narrowed it -- a perfectly reasonable
 * thing for somebody to do to a table of who asked to be forgotten -- would
 * make every barrier below silently pass. Read as the definer, the row is
 * simply there.
 */
create or replace function public.being_erased()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.erasure_requests r
    where r.user_id = (select auth.uid())
  )
$$;

comment on function public.being_erased() is
  'Whether the caller has an erasure request, and so may no longer write.';

-- ---------------------------------------------------------------------------
-- The write policies, again
-- ---------------------------------------------------------------------------
--
-- Every one of these is the policy from the migration named above it, copied
-- unchanged, with one line added. Copied rather than altered because Postgres
-- has no `alter policy ... add`, and stated in full rather than abbreviated so
-- that what the policy allows is still readable in one piece.
--
-- The new line goes in `with check` and never in `using`. A `using` clause that
-- stopped matching would make the write silently affect no rows; a `with check`
-- that fails raises, and somebody who is being told their account is going
-- should get an error rather than a button that does nothing.

-- `0001`. The one that outlives the account: see the header.
drop policy if exists "A driver adds a spot as themselves" on public.spots;
create policy "A driver adds a spot as themselves"
  on public.spots for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
    and not (select public.being_erased())
  );

drop policy if exists "An owner corrects their own spot" on public.spots;
create policy "An owner corrects their own spot"
  on public.spots for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
  )
  with check (
    (owner_id is null or owner_id = (select auth.uid()))
    and created_by = created_by
    and not (select public.being_erased())
  );

-- `0002`. An offer of a parking space is a standing invitation to turn up at
-- an address, which is a poor thing to leave behind you.
drop policy if exists "An owner offers their own spot" on public.availability_windows;
create policy "An owner offers their own spot"
  on public.availability_windows for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and not (select public.being_erased())
  );

drop policy if exists "An owner changes their own offer" on public.availability_windows;
create policy "An owner changes their own offer"
  on public.availability_windows for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and not (select public.being_erased())
  );

-- `0003`. These cascade off the login, so the barrier is not about what
-- survives: a report is a registration number and a photograph of somebody
-- else's car, published under the name of an account that asked to be closed,
-- and the project should not be taking new ones on their behalf.
drop policy if exists "A driver files a report as themselves" on public.reports;
create policy "A driver files a report as themselves"
  on public.reports for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select public.being_erased())
  );

drop policy if exists "An author corrects their own report" on public.reports;
create policy "An author corrects their own report"
  on public.reports for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and not (select public.being_erased())
  );

drop policy if exists "Anybody acts on a report, under their own name" on public.report_events;
create policy "Anybody acts on a report, under their own name"
  on public.report_events for insert
  to authenticated
  with check (
    actor = (select auth.uid())
    and not (select public.being_erased())
  );

-- `0012`. The row that says where a person leaves their car. It cascades, but
-- the gap is exactly the window in which somebody drives home.
drop policy if exists "A driver records where they parked" on public.parkings;
create policy "A driver records where they parked"
  on public.parkings for insert
  to authenticated
  with check (
    driver = (select auth.uid())
    and not (select public.being_erased())
  );

-- `0008`. `erase_me` deletes the profile row, so this update matches nothing
-- and the barrier is belt to that brace -- unless the row comes back, which is
-- what the trigger on `auth.users` would do if the account were ever recreated
-- under the same uuid.
drop policy if exists "A person edits their own profile" on public.profiles;
create policy "A person edits their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and not (select public.being_erased())
  );

-- `0013`, restated through the function so that the bucket and the tables
-- cannot come to disagree about what a pending erasure means. The condition is
-- the same one; only where it is read from has changed, and the docstring
-- above says why that matters.
drop policy if exists "A driver uploads into their own folder" on storage.objects;
create policy "A driver uploads into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select public.being_erased())
  );

drop policy if exists "A driver replaces their own photo" on storage.objects;
create policy "A driver replaces their own photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select public.being_erased())
  );

-- ---------------------------------------------------------------------------
-- Who may ask
-- ---------------------------------------------------------------------------
--
-- A function a policy calls has to be executable by the role the policy is
-- evaluated for, and every policy above is `to authenticated` -- which includes
-- the anonymous sessions this project files most of its reports from, since
-- those are `authenticated` too and `is_anonymous_session` in `0008` is what
-- tells them apart. `anon` is granted alongside it the way `has_role` is, so
-- that a later policy written `to anon, authenticated` does not fail on a role
-- for which the answer is a plain no. `service_role` bypasses row level
-- security and never reaches any of this.

revoke all on function public.being_erased() from public;
grant execute on function public.being_erased() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who added a spot stops being editable
-- ---------------------------------------------------------------------------
--
-- `An owner corrects their own spot` above carries `and created_by = created_by`
-- and has since `0001`, where the comment beside it says the `with check`
-- "repeats the `using` clause so an update cannot hand the row to somebody else
-- on its way out". It does not. Inside a `with check` both sides are the new
-- row, so the line reads `x = x`: true for every value there is, and doing
-- nothing beyond refusing a row whose author is already null.
--
-- That cost nothing while nothing read the column. The second pass below reads
-- it -- an erasure has to find the kerbs somebody added, and those have no
-- owner to find them by -- and an author anybody can rewrite is a way to point
-- one person's erasure at another person's row. The `where` clause there
-- refuses to touch a spot that has an owner, which is the half that holds even
-- if this trigger is ever dropped. This is the other half.
--
-- Null goes through, and has to: severing the author is what `forget_everything`
-- does a few lines later, and what `0001` does by cascade. Somebody may stop
-- being the author of a spot. They may not become somebody else.

create or replace function public.spots_keep_their_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is not null and new.created_by is distinct from old.created_by then
    raise exception 'Who added a spot cannot be changed'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists spots_keep_their_author on public.spots;
create trigger spots_keep_their_author
  before update on public.spots
  for each row execute function public.spots_keep_their_author();

-- ---------------------------------------------------------------------------
-- The second pass
-- ---------------------------------------------------------------------------
--
-- A barrier can only refuse a write it can see, and `erase_me` writes the
-- request and deletes the rows in one transaction. A statement that began
-- before that transaction committed is reading a snapshot with no request in
-- it: `being_erased()` says no, the write is allowed, and it commits after the
-- deletions have already run past it. The window is milliseconds rather than
-- the hour the policies above close, and it is the window in which somebody
-- presses the button on one telephone while the other is still uploading.
--
-- Serialising every write in the project against an advisory lock would close
-- it, at the cost of a lock on the hot path of an app that is mostly writes,
-- to save a millisecond of a race nobody can aim at. The cheaper answer is to
-- do it twice: the job that finishes an erasure repeats the deletions before
-- it deletes the login, hours later, when anything in flight has long since
-- committed and is plainly visible.
--
-- So `erase_me` keeps its transaction and its receipt, and what it deletes
-- moves here, into a function that takes a uuid and can therefore be run again
-- by somebody holding the service key. One definition of what an erasure
-- removes, run twice, rather than two definitions that will drift.
--
-- IT ALSO FIXES A DELETION THAT COULD NOT FINISH. `0010` requires that a
-- `private_property` spot has an owner, and `spots.owner_id` is `on delete set
-- null`. A private spot belonging to somebody being erased therefore has to be
-- deleted *before* their `auth.users` row is, or the delete violates the check
-- constraint and the erasure can never complete -- it fails every night,
-- quietly, in a log. `erase_me` deletes those spots, so this only bites for a
-- spot that arrived in the window above; the second pass is what makes sure
-- there is nothing left to bite on.

/**
 * Delete everything this database holds about somebody.
 *
 * The body `erase_me` used to hold, in `0012`, with the uuid passed in rather
 * than taken from the session, because it has two callers now: the person, and
 * the job that finishes what they started.
 *
 * Idempotent, and it has to be: the second run is the point, and it must not
 * fail or lie because the first one already worked. Every statement is a delete
 * or a null-ing, so a second run counts zero of everything.
 */
create or replace function public.forget_everything(who uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reports_gone integer;
  spots_gone integer;
  windows_gone integer;
  parkings_gone integer;
  actions_severed integer;
begin
  -- Their complaints, and with each one its history and its evidence rows.
  -- `official_resolutions.report_id` severs here rather than cascading, which
  -- is the whole of what an institution keeps.
  with removed as (
    delete from public.reports where created_by = who returning 1
  )
  select count(*) into reports_gone from removed;

  with removed as (
    delete from public.availability_windows where owner_id = who returning 1
  )
  select count(*) into windows_gone from removed;

  -- Where they parked, and this one goes first among equals in the honest
  -- reading of it: it is the record whose survival would be worst.
  with removed as (
    delete from public.parkings where driver = who returning 1
  )
  select count(*) into parkings_gone from removed;

  -- Before the null-ing below, and before the login goes: see the header on
  -- `spots_property_has_an_owner`.
  with removed as (
    delete from public.spots
    where owner_id = who and access = 'private_property'
    returning 1
  )
  select count(*) into spots_gone from removed;

  -- The name, on anything they had a hand in. `where owner_id = who` was the
  -- whole of this in `0012` and it could not reach the case that matters:
  -- `0010` requires a `public_facility` to have no owner, so a kerb somebody
  -- adds is always `owner_id is null` -- and `owner_name` on it is free text
  -- that the insert policy never looked at. Under the old rule that name was
  -- never cleared by anything, and severing `created_by` a line later took away
  -- the only remaining way to find it. A person's name, on the public map, for
  -- good, after they asked to be forgotten.
  --
  -- `owner_id is null and` is not tidiness. Without it this reaches rows owned
  -- by somebody else and merely attributed to this person, and `created_by` is
  -- a column the owner of a spot can set to any uuid they like -- see the
  -- trigger below, which is why it now cannot. Two ways that went wrong: a
  -- stranger's `residential_permit` quietly losing its owner, and a stranger's
  -- `private_property` making this very statement violate
  -- `spots_property_has_an_owner`, which would raise, roll the erasure back,
  -- and leave a person unable to close their account at all. An ownerless spot
  -- cannot break either: setting `owner_id` to null is what it already is.
  update public.spots
  set owner_id = null, owner_name = null
  where owner_id = who or (owner_id is null and created_by = who);

  update public.spots set created_by = null where created_by = who;

  -- What they did about other people's reports. The rows stay; the name goes.
  with severed as (
    update public.report_events set actor = null
    where actor = who returning 1
  )
  select count(*) into actions_severed from severed;

  delete from public.user_roles where user_id = who;

  -- The profile row is cascaded by the `auth.users` delete, but that happens in
  -- another process at another time, and a display name is the one column here
  -- that names a person to strangers. It goes now.
  delete from public.profiles where id = who;

  return jsonb_build_object(
    'reports_deleted', reports_gone,
    'availability_windows_deleted', windows_gone,
    'private_spots_deleted', spots_gone,
    'parkings_deleted', parkings_gone,
    'actions_kept_unattributed', actions_severed,
    'storage_prefix', who::text || '/',
    -- Said in the return value because the client shows it: the account is not
    -- gone at the moment this returns, and telling somebody it is would be the
    -- one lie in a privacy screen.
    'login_and_photos_pending', true
  );
end;
$$;

comment on function public.forget_everything(uuid) is
  'Deletes everything the database holds about one person. Idempotent.';

/**
 * Make it stop, for the caller.
 *
 * What `0012` created, kept identical from the outside -- same name, same
 * receipt, same grants -- with the deletions moved into the function above.
 * The request is recorded first, in the same transaction, so that the barrier
 * is standing before anything is removed.
 */
create or replace function public.erase_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  gone jsonb;
begin
  if me is null then
    raise exception 'Only a signed-in account can be erased'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.erasure_requests (user_id, storage_prefix)
  values (me, me::text || '/')
  on conflict (user_id) do nothing;

  gone := public.forget_everything(me);

  update public.erasure_requests
  set database_done_at = now()
  where user_id = me;

  return gone;
end;
$$;

comment on function public.erase_me() is
  'Deletes the caller''s rows and records what only the service key can finish.';

/**
 * The work a job with the service key still has to do, once it is safe to do.
 *
 * `0012` returned every open request. This adds an age to it, and the age is
 * the other half of the answer to the race above: repeating the deletions only
 * helps if the repeat happens after the writes it is meant to catch have
 * landed. A request made at one minute to four would otherwise be finished at
 * four, sixty seconds later, with the cron time to aim at printed in `0013`.
 *
 * Three hours, and it is the storage API that sets the figure rather than
 * anything here. An upload is authorised when it starts and not when it
 * finishes, and a signed upload URL is authorised when it is minted -- Supabase
 * gives one two hours to live. So a token taken out in the moment before the
 * button was pressed can still put a file in the bucket a hundred and nineteen
 * minutes later, past any sweep that ran in between, and the policies above
 * never see it. Waiting longer than the longest of those is what makes one
 * sweep enough for anything given out before the request; nothing can revoke
 * an authorisation already given, and three hours is a margin rather than a
 * bound, which is what `finished_erasures` below is for.
 *
 * The cost is that the photographs and the login can wait a night longer than
 * they used to. The rows are already gone by then -- `erase_me` deleted them at
 * the moment of asking -- and what waits is a private bucket and a login whose
 * remaining power is to read what is in it, which is that person's own
 * photographs. If Supabase ever lengthens the life of an upload token, this
 * interval is what has to move with it.
 */
create or replace function public.pending_erasures()
returns table (user_id uuid, requested_at timestamptz, storage_prefix text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, x.requested_at, x.storage_prefix
  from public.erasure_requests x
  where x.completed_at is null
    and x.requested_at < now() - interval '3 hours'
  order by x.requested_at
$$;

comment on function public.pending_erasures() is
  'Erasures whose photographs and login are still there, and old enough to finish.';

-- A closed request is watched for a few nights afterwards, and this is where
-- the count of them lives. A column rather than a window of time, and that is
-- the whole design: a week of nights is only a week if the job runs every
-- night, and a job that is down for eight days would let every erasure closed
-- before the outage age quietly out of the list and never be looked at again.
-- A count of quiet nights cannot age out. An outage delays it; nothing else
-- touches it.
alter table public.erasure_requests
  add column if not exists quiet_nights integer not null default 0;

comment on column public.erasure_requests.quiet_nights is
  'Nights the prefix has been listed since it was closed and found to be empty.';

/**
 * Closed erasures whose prefix is still being watched.
 *
 * The three hours in `pending_erasures` outlive every authorisation this
 * project can watch being given. They do not bound one. A storage request is
 * authorised when it starts and not when its body finishes, so an upload begun
 * a minute before its token expired can still be arriving when the sweep runs,
 * and land after `finish_erasure`. Nothing in this schema can refuse it: by
 * then there is no row to check, no policy left to evaluate, and no login to
 * disable.
 *
 * So the last word here is not a refusal but a second look, and a third. The
 * job lists the prefix again on the nights after a request was closed, deletes
 * whatever is there, and counts it apart from everything else -- a file under a
 * closed erasure is the one number in a run that means somebody got past all of
 * the above, and it should not be added to a total that a quiet night also
 * produces. Finding one puts `quiet_nights` back to nought, because the
 * question the count answers is "has it been still since the last thing
 * arrived", not "how long ago did this person leave".
 *
 * Three nights, and they are nights rather than days for the reason above. It
 * is a listing of a prefix that is almost always empty, so the cost of being
 * generous here is a few hundred milliseconds a night.
 *
 * WHAT THREE NIGHTS DOES NOT PROVE, and this is where the argument ends rather
 * than concludes. The watch stops when the prefix has been still for three
 * nights running; it cannot show that no request is still open. A single
 * upload, authorised before the erasure and streaming for four days, would land
 * after the last look and never be swept, and no interval and no count can
 * close that -- only a check at the moment the object is written, which is a
 * hook Supabase does not offer. What is left is a bound on the plausible and an
 * alarm on the rest: anything found while the watch is on restarts it and is
 * reported by name. `docs/dpia.md` says so under what is not done, because a
 * measure that cannot be complete should be written down as what it is rather
 * than left to be read as more.
 *
 * WHY IT NEED NOT BE PAGED. PostgREST caps what it returns, and a night that
 * closed more erasures than the cap would come back short. That is safe here
 * and it would not have been under a window of time: the ones this run confirms
 * stop being returned, the rest keep their count and their place in the order,
 * and the next night carries on where this one stopped.
 */
create or replace function public.finished_erasures(nights integer default 3)
returns table (user_id uuid, storage_prefix text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, coalesce(x.storage_prefix, x.user_id::text || '/')
  from public.erasure_requests x
  where x.completed_at is not null
    and x.quiet_nights < nights
  order by x.completed_at
$$;

comment on function public.finished_erasures(integer) is
  'Closed erasures whose prefix has not yet been quiet for long enough.';

/**
 * Write down how a night's look went.
 *
 * Two outcomes and one column. Nothing there is a quiet night and counts
 * towards the end of the watch; anything there resets it, and the run says so
 * separately. A listing that failed is neither -- it is not evidence of quiet,
 * so the caller does not call this at all and the count simply stays where it
 * was until a night that can answer.
 */
create or replace function public.record_a_recheck(whose uuid, anything_found boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.erasure_requests
  set quiet_nights = case when anything_found then 0 else quiet_nights + 1 end
  where user_id = whose and completed_at is not null
$$;

comment on function public.record_a_recheck(uuid, boolean) is
  'Counts a night on which a closed erasure''s prefix was looked at.';

-- A uuid argument is a licence to erase anybody, so this one is the service
-- key's alone. `erase_me` reaches it as its own definer rather than as the
-- person calling it, which is why the person needs no privilege on it.
revoke all on function public.forget_everything(uuid) from public, anon, authenticated;
grant execute on function public.forget_everything(uuid) to service_role;

revoke all on function public.erase_me() from public;
grant execute on function public.erase_me() to anon, authenticated, service_role;

revoke all on function public.pending_erasures() from public, anon, authenticated;
grant execute on function public.pending_erasures() to service_role;

revoke all on function public.finished_erasures(integer) from public, anon, authenticated;
grant execute on function public.finished_erasures(integer) to service_role;

revoke all on function public.record_a_recheck(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_a_recheck(uuid, boolean) to service_role;
