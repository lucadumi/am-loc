-- Where the photographs of a blocked pavement live.
--
-- Public, because the evidence is the report. A complaint forwarded to a
-- sector hall is text plus a link, and a link that needs a bearer token is a
-- link nobody at the far end can open.
--
-- Paths are `<uploader uuid>/<report id>/<millis>-<index>.<ext>`, built by
-- `uploadPhotos` in lib/supabase-data.ts. The first segment is load-bearing:
-- the policies below scope writes to a folder named after the caller, so one
-- driver cannot overwrite another's evidence by guessing a path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  true,
  -- 10 MB. A phone photograph is 2-5 MB and the app sends the original; the
  -- limit is here so a video picked by mistake fails at the first byte rather
  -- than after ninety seconds on mobile data.
  10485760,
  -- Exactly the types `EXTENSIONS` in lib/supabase-data.ts knows how to name.
  -- Anything else would be stored as a file nothing can open.
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Readable without a session. `getPublicUrl` builds an unsigned URL and the
-- map draws it before anybody signs in.
create policy "Report photos are readable by everybody"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'report-photos');

-- You may only write inside a folder named after your own uuid.
create policy "A driver uploads into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Editing a report can replace a photograph, so an upsert to your own path has
-- to be allowed. Somebody else's path still is not.
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
  );

create policy "A driver removes their own photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
