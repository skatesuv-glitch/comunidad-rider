-- Comunidad Rider · migración inicial
-- Generada desde database/schema.sql + database/security.sql

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


-- Seguridad por usuario
-- Seguridad prevista para PostgreSQL con autenticación por usuario.
-- Ejecutar solo cuando auth.uid() esté disponible en el proveedor elegido.

alter table profiles enable row level security;
alter table presence enable row level security;
alter table shared_locations enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table routes enable row level security;
alter table route_favorites enable row level security;
alter table challenge_members enable row level security;
alter table voice_invites enable row level security;

-- El id del perfil debe corresponder con el usuario autenticado.
create policy profiles_read on profiles for select using (true);
create policy profiles_own_write on profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy presence_read on presence for select using (true);
create policy presence_own_write on presence for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Solo posiciones vigentes pueden leerse. Cada rider solo escribe la suya.
create policy locations_read_active on shared_locations for select using (expires_at > now());
create policy locations_own_write on shared_locations for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Solo miembros de una conversación pueden leerla y leer/escribir mensajes.
create policy conversation_member_read on conversations for select using (
  exists(select 1 from conversation_members m where m.conversation_id=id and m.profile_id=auth.uid())
);
create policy members_member_read on conversation_members for select using (
  exists(select 1 from conversation_members m where m.conversation_id=conversation_id and m.profile_id=auth.uid())
);
create policy messages_member_read on messages for select using (
  exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.profile_id=auth.uid())
);
create policy messages_member_insert on messages for insert with check (
  sender_id=auth.uid() and exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.profile_id=auth.uid())
);

create policy routes_read on routes for select using (true);
create policy routes_own_write on routes for all using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy favorites_own on route_favorites for all using (profile_id=auth.uid()) with check (profile_id=auth.uid());
create policy challenge_members_own on challenge_members for all using (profile_id=auth.uid()) with check (profile_id=auth.uid());

create policy voice_invites_participants_read on voice_invites for select using (sender_id=auth.uid() or recipient_id=auth.uid());
create policy voice_invites_sender_insert on voice_invites for insert with check (sender_id=auth.uid());
create policy voice_invites_participants_update on voice_invites for update using (sender_id=auth.uid() or recipient_id=auth.uid());



-- Trigger de despliegue inicial tras conectar Supabase con GitHub.
