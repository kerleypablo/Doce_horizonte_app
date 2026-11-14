-- MCP permanece desabilitado ate ser concedido por usuario ou plano.
insert into public.module_catalog (key, name, premium, description, active)
values ('mcp', 'Acesso ao MCP', false, 'Conexao de assistentes de IA aos modulos autorizados', true)
on conflict (key) do update set name = excluded.name, premium = excluded.premium,
  description = excluded.description, active = excluded.active;
