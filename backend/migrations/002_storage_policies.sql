-- Storage rules for the profile-photos bucket.
--
-- The browser used to upload avatars itself using the anon key, which
-- ships inside the app bundle and is therefore public. That could not be
-- made safe: GigEzee signs people in with Firebase, so Supabase sees no
-- session and auth.uid() is null - any policy strict enough to stop a
-- stranger would also have stopped the real member.
--
-- Uploads now go through POST /users/me/avatar, which checks the Firebase
-- token, checks the file, and writes with the service role key. So this
-- bucket grants the browser reads only. Avatars are shown to the other
-- side of a booking, so reads stay public; every write must come from the
-- server. service_role bypasses these policies, which is what lets the
-- backend through.
--
-- Apply in the Supabase dashboard: SQL Editor -> paste -> Run.
-- Safe to re-run: each policy is dropped before it is created.

-- The bucket itself. `public` here governs read access only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'profile-photos',
    'profile-photos',
    true,
    5242880,                                      -- 5 MB, same cap as the API
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public             = true,
    file_size_limit    = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];


-- Anyone may look at an avatar: they appear in chat and on the live map
drop policy if exists "profile photos are readable" on storage.objects;

create policy "profile photos are readable"
on storage.objects for select
using (bucket_id = 'profile-photos');


-- Nobody holding a browser key may write, replace or delete. These drops
-- clear the permissive policies an earlier set-up may have left behind,
-- including Supabase's own "give anon full access" starter policies.
drop policy if exists "members upload their own photo" on storage.objects;
drop policy if exists "members replace their own photo" on storage.objects;
drop policy if exists "members delete their own photo" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder" on storage.objects;
drop policy if exists "Enable insert for authenticated users only" on storage.objects;
drop policy if exists "Enable update for authenticated users only" on storage.objects;
drop policy if exists "Enable delete for authenticated users only" on storage.objects;


-- Row level security must be on for the policies above to mean anything.
-- It is normally on already in a Supabase project; this makes it certain.
alter table storage.objects enable row level security;


-- Check: this should list exactly one policy, the readable one.
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects'
   and qual like '%profile-photos%'
    or with_check like '%profile-photos%';
