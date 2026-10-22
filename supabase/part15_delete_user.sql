create or replace function admin_delete_user(uid uuid)
returns void
language plpgsql security definer set search_path = public, auth as
$$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'not allowed';
  end if;
  if uid = auth.uid() then
    raise exception 'cannot delete yourself';
  end if;
  update team_members set user_id = null where user_id = uid;
  delete from client_projects where user_id = uid;
  delete from push_subscriptions where user_id = uid;
  update messages set sender = null where sender = uid;
  delete from profiles where id = uid;
  delete from auth.users where id = uid;
end
$$;
grant execute on function admin_delete_user(uuid) to authenticated;
