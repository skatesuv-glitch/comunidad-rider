-- Mensajería directa simplificada para Comunidad Rider
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_pair_idx on direct_messages(sender_id,receiver_id,created_at);
alter table direct_messages enable row level security;
create policy direct_messages_read_participants on direct_messages for select using (sender_id=auth.uid() or receiver_id=auth.uid());
create policy direct_messages_send_own on direct_messages for insert with check (sender_id=auth.uid());
