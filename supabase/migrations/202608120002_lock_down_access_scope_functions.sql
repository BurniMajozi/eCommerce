-- Supabase grants function execution to API roles through default privileges.
-- PUBLIC revocation alone does not remove those direct grants.

revoke execute on function public.is_platform_owner(uuid) from anon;
revoke execute on function public.is_tenant_member(uuid, uuid) from anon;
revoke execute on function public.has_capability(uuid, text, uuid) from anon;

revoke execute on function public.resolve_access_scope(uuid, uuid, uuid)
  from anon, authenticated;

grant execute on function public.is_platform_owner(uuid)
  to authenticated, service_role;
grant execute on function public.is_tenant_member(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.has_capability(uuid, text, uuid)
  to authenticated, service_role;
grant execute on function public.resolve_access_scope(uuid, uuid, uuid)
  to service_role;
