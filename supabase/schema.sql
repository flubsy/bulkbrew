-- Deckbit cloud sync schema. Paste into Supabase → SQL Editor → Run. Safe to re-run.
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

-- Lets a user wipe their own cloud copy from the Account page.
create or replace function public.delete_my_data() returns void
language sql security invoker as $$
  delete from public.user_data where user_id = auth.uid();
$$;
