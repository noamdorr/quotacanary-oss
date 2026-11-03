-- 099_treg_key_only.sql
-- QUO-423: a treg key names its own org through GET /auth/me, so the Org ID
-- field goes and the key alone is the credential (the default single field).
-- Saved {"api_token","org_id"} secrets keep reading: the adapter takes their
-- token and ignores the org id.
update public.tools
  set
    credential_fields = null,
    key_instructions = 'In treg, copy an API token. Checking the balance is free.'
  where id = 'treg';
