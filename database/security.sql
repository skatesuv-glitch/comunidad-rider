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
