-- The v1 limiter has no current callers. Retain service-role execution only for
-- rollout compatibility while denying every untrusted API role.
revoke execute on function public.consume_api_rate_limit(uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(uuid, int, int)
  to service_role;
