-- Chat Rider: crea o reutiliza una conversación privada entre el usuario autenticado y otro perfil.
create or replace function public.get_or_create_private_conversation(other_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
begin
  if me is null or other_profile is null or me = other_profile then
    return null;
  end if;

  if not exists(select 1 from profiles where id = other_profile) then
    return null;
  end if;

  select c.id into existing_id
  from conversations c
  join conversation_members mine on mine.conversation_id = c.id and mine.profile_id = me
  join conversation_members theirs on theirs.conversation_id = c.id and theirs.profile_id = other_profile
  where (select count(*) from conversation_members cm where cm.conversation_id = c.id) = 2
  order by c.created_at
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into conversations default values returning id into new_id;
  insert into conversation_members(conversation_id, profile_id)
  values (new_id, me), (new_id, other_profile);

  return new_id;
end;
$$;

revoke all on function public.get_or_create_private_conversation(uuid) from public;
grant execute on function public.get_or_create_private_conversation(uuid) to authenticated;
