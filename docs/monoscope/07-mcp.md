# MCP

## Existe MCP?

Sim. O Monoscope implementa um endpoint MCP em:

`POST /api/v1/mcp`

Ele fica em `src/Web/MCP.hs` e e ligado nas rotas em `src/Web/Routes.hs`.

## Protocolo

O handler implementa HTTP JSON-RPC 2.0 para MCP, com versao:

`2025-06-18`

Metodos suportados:

- `initialize`
- `notifications/*`
- `tools/list`
- `tools/call`

## Autenticacao

O endpoint fica dentro das rotas publicas `/api/v1` com API key auth. Clientes MCP usam bearer token/API key.

## Como gera tools

`mcpToolRegistry = MCP.allTools apiV1OpenApiSpec`

O registry combina:

- tools derivadas do OpenAPI da API publica;
- tools compostas/manuais.

O proprio `/mcp` e filtrado para nao virar uma tool chamavel.

## Execucao de tool

Em `tools/call`, o handler:

1. Faz parse do nome e argumentos da tool.
2. Reconstroi uma request interna para o sub-app Servant da API v1.
3. Executa a rota correspondente no backend.
4. Devolve resposta no envelope MCP.

Erros de execucao retornam como tool result com `isError`, nao necessariamente como erro JSON-RPC.

## Tools compostas

Pelos docs/testes e codigo, existem workflows compostos como:

- `find_error_patterns`
- `search_events_nl`
- `analyze_issue`

Essas tools agregam chamadas internas e/ou AI para experiencias mais "agent friendly".

## Caracteristicas tecnicas

- Timeout para evitar travar MCP indefinidamente.
- Truncamento de respostas REST antes de colocar no envelope MCP.
- `structuredContent` com conteudo completo/estruturado quando aplicavel.
- Nomes de tools em estilo verb-first snake_case.
- Cobertura de testes em `test/integration/Web/ApiV1Spec.hs`.

## Fontes no codigo

- `src/Web/MCP.hs`
- `src/Web/Routes.hs`
- `docs/mcp.md`
- `test/integration/Web/ApiV1Spec.hs`
