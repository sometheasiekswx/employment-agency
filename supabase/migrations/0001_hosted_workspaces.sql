-- Apply in a dedicated FREE Supabase project. No personal identities in this file.
create table public.career_workspaces (
  owner uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  object_key text,
  bytes bigint not null default 0,
  deleting boolean not null default false
);
alter table public.career_workspaces enable row level security;
revoke all on public.career_workspaces from anon, authenticated;
grant all on public.career_workspaces to service_role;
-- All access goes through the authenticated application boundary. No client writes.
create or replace function public.commit_career_workspace(who uuid, expected bigint, object_name text, size_bytes bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if size_bytes < 1 or size_bytes > 3145728 or object_name not like who::text || '/%' then
    raise exception 'Invalid snapshot';
  end if;
  insert into public.career_workspaces(owner) values(who) on conflict do nothing;
  update public.career_workspaces set revision=revision+1, object_key=object_name, bytes=bytes+size_bytes
    where owner=who and revision=expected and not deleting and revision<250 and bytes+size_bytes<=52428800
    returning revision into next_revision;
  if next_revision is null then raise exception 'Conflict or pilot storage quota'; end if;
  return next_revision;
end $$;
revoke all on function public.commit_career_workspace(uuid,bigint,text,bigint) from public, anon, authenticated;
grant execute on function public.commit_career_workspace(uuid,bigint,text,bigint) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('career-private','career-private',false,3145728,array['application/zip']) on conflict(id) do nothing;
-- No storage policies are granted to anon/authenticated; service key stays server-only.
