-- Comunidad Rider · esquema inicial PostgreSQL
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  city text,
  board text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists presence (
  profile_id uuid primary key references profiles(id) on delete cascade,
  is_online boolean not null default false,
  last_seen timestamptz not null default now()
);

create table if not exists shared_locations (
  profile_id uuid primary key references profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists shared_locations_expiry_idx on shared_locations(expires_at);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  primary key(conversation_id,profile_id)
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages(conversation_id,created_at);

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  city text,
  distance_km numeric(8,2),
  duration_seconds integer,
  elevation_gain_m integer,
  track_geojson jsonb,
  created_at timestamptz not null default now()
);
create table if not exists route_favorites (
  route_id uuid references routes(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(route_id,profile_id)
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  metric text not null check(metric in ('distance_km','elevation_m','new_routes')),
  target numeric not null,
  starts_at timestamptz,
  ends_at timestamptz
);
create table if not exists challenge_members (
  challenge_id uuid references challenges(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  progress numeric not null default 0,
  joined_at timestamptz not null default now(),
  primary key(challenge_id,profile_id)
);

create table if not exists voice_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired','ended')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Nunca devolver ubicaciones caducadas.
create or replace view active_shared_locations as
select * from shared_locations where expires_at > now();
