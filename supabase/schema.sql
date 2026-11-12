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

-- ---------------------------------------------------------------------------------------------
-- Username + password accounts. Added Nov 2026; run this whole file again to add it.
--
-- Supabase stores the email and password. This adds a unique username, so people can sign in
-- with either their username or their email. The username is only ever turned into an email
-- AFTER the password has been checked (login_email), so nobody can look up someone's email
-- from their username. Five wrong passwords lock that username for 15 minutes.
--
-- Also needed, in the dashboard: Authentication → Sign In / Providers → Email: enabled,
-- and "Confirm email" OFF (accounts work straight away, no verification email).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  username      text        not null check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  failed_logins integer     not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- New account with a username in its sign-up data → profile row. A taken username fails the
-- sign-up (the app checks availability first, so this only catches a race).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'username', '') <> '' then
    insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_username ~ '^[A-Za-z0-9_.-]{3,24}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

-- Username + password → the account's email, only if the password is right (then the app signs
-- in normally with email + password). Wrong password → null.
create or replace function public.login_email(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.profiles;
  u auth.users;
begin
  select * into p from public.profiles where lower(username) = lower(p_username);
  if not found then return null; end if;
  if p.locked_until is not null and p.locked_until > now() then
    raise exception 'Too many wrong passwords. Try again in a few minutes, or reset your password.';
  end if;
  select * into u from auth.users where id = p.id;
  if coalesce(u.encrypted_password, '') like '$2%' and u.encrypted_password = crypt(p_password, u.encrypted_password) then
    update public.profiles set failed_logins = 0, locked_until = null where id = p.id;
    return u.email;
  end if;
  update public.profiles
    set failed_logins = failed_logins + 1,
        locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else null end
    where id = p.id;
  return null;
end $$;

-- Signed in: choose or change your username (e.g. accounts made with Google).
create or replace function public.set_username(p_username text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_username !~ '^[A-Za-z0-9_.-]{3,24}$' then raise exception 'Usernames are 3–24 letters, numbers, _ . or -'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username) and id <> auth.uid()) then
    raise exception 'That username is taken';
  end if;
  insert into public.profiles (id, username) values (auth.uid(), p_username)
    on conflict (id) do update set username = excluded.username;
end $$;

revoke execute on function public.username_available(text) from public;
revoke execute on function public.login_email(text, text) from public;
revoke execute on function public.set_username(text) from public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.login_email(text, text) to anon, authenticated;
grant execute on function public.set_username(text) to authenticated;
