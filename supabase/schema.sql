-- BulkBrew cloud sync schema. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- One generic table holds every synced record (collection cards, saved decks, reference decks,
-- wishlist) as JSON, keyed by (user, kind, id). Row Level Security means each signed-in user can
-- only ever read or write their own rows — the public "anon" key can't see anyone else's data.

create table if not exists public.user_data (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('owned', 'refDecks', 'builds', 'wishlist')),
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);

create index if not exists user_data_user_updated on public.user_data (user_id, updated_at);

-- Server-assigned change time (clock_timestamp: unique per row even inside one big upsert),
-- used as the "pull everything changed since X" cursor.
create or replace function public.user_data_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.user_data_touch();

alter table public.user_data enable row level security;

drop policy if exists "user_data: own rows only" on public.user_data;
create policy "user_data: own rows only" on public.user_data
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Explicit grants: newer Supabase projects don't always expose new tables to the API automatically.
-- Signed-in users only; RLS above still limits them to their own rows. The anon role gets nothing.
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

-- Lets a user wipe their own cloud copy from the Account page.
create or replace function public.delete_my_data() returns void
language sql security invoker as $$
  delete from public.user_data where user_id = auth.uid();
$$;

revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Shared deck links (/d/<id>). Added Nov 2026 — run this whole file again to add it.
--
-- Anyone (signed in or not) can create a share; anyone with the link can read it. There is no
-- table access for the API roles at all: everything goes through the two functions below, so
-- nobody can list or scrape other people's shares, only open a link they were given.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.shared_decks (
  id         text        primary key,
  owner      uuid        references auth.users (id) on delete set null,
  data       jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  views      integer     not null default 0
);

alter table public.shared_decks enable row level security;
revoke all on public.shared_decks from anon, authenticated;

-- Create a share, or update one you own (signed in, same id). Returns the id.
create or replace function public.share_deck(p_data jsonb, p_id text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_id text;
begin
  if pg_column_size(p_data) > 600000 then
    raise exception 'Deck too large to share';
  end if;
  if p_id is not null and auth.uid() is not null then
    update public.shared_decks set data = p_data, updated_at = now()
      where id = p_id and owner = auth.uid();
    if found then return p_id; end if;
  end if;
  new_id := left(replace(gen_random_uuid()::text, '-', ''), 12);
  insert into public.shared_decks (id, owner, data) values (new_id, auth.uid(), p_data);
  return new_id;
end $$;

-- Read one share by id.
create or replace function public.get_shared_deck(p_id text) returns jsonb
language sql security definer set search_path = public as $$
  update public.shared_decks set views = views + 1 where id = p_id returning data;
$$;

revoke execute on function public.share_deck(jsonb, text) from public;
revoke execute on function public.get_shared_deck(text) from public;
grant execute on function public.share_deck(jsonb, text) to anon, authenticated;
grant execute on function public.get_shared_deck(text) to anon, authenticated;
