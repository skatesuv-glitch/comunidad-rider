alter table public.voice_invites
  add column if not exists session_id text;

create index if not exists voice_invites_recipient_pending_idx
  on public.voice_invites(recipient_id,status,expires_at);
