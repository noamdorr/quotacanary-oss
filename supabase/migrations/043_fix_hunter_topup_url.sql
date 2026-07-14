-- Hunter moved the billing/upgrade page; the old /billing path now 404s.
update public.tools
  set topup_url = 'https://hunter.io/welcome/upgrade'
  where id = 'hunter';
