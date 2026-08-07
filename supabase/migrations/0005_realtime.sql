-- Publishing the change feed the map listens to.
--
-- Without this, `lib/live.ts` subscribes happily and receives nothing, which
-- is the worst failure available here: a client that reports success and goes
-- quiet looks exactly like a city where nothing is happening. The map silently
-- degrades to refresh-on-focus and nobody finds out until a driver complains
-- that a space they announced never appeared.
--
-- The tables listed have to be exactly the ones in `TABLES` in lib/live.ts:
--
--     spots   -> spots, status_reports
--     reports -> reports, report_events
--
-- `alter publication ... add table` errors if the table is already a member,
-- so each is added only when it is not, which keeps this file re-runnable.

do $$
declare
  live_table text;
begin
  foreach live_table in array array[
    'spots',
    'status_reports',
    'availability_windows',
    'reports',
    'report_events'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = live_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', live_table
      );
    end if;
  end loop;
end
$$;

-- What the change feed carries when a row is deleted.
--
-- Postgres sends only the primary key by default, which is enough here: every
-- listener in lib/live.ts throws the payload away and refetches, on purpose,
-- so that applying a diff by hand does not become a second implementation of
-- the flattening in supabase-rows.ts and the belief model on top of it.
--
-- Left at the default deliberately rather than by omission. `replica identity
-- full` would put every column of every deleted row on the wire, including the
-- ones row level security exists to withhold.
