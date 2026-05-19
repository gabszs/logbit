# Frontend

## Modelo principal

O frontend nao e uma SPA React tradicional. A maior parte da UI e renderizada pelo backend Haskell usando Lucid, com interatividade incremental por HTMX e Hyperscript.

Padrao encontrado:

- Pages em Haskell dentro de `src/Pages/*`.
- Componentes server-side em `src/Pkg/Components/*`.
- Rotas Servant devolvendo HTML.
- HTMX para requests parciais, swaps, formularios, abas, drawers e atualizacoes.
- Hyperscript para pequenos comportamentos declarativos no HTML.

## Bibliotecas visuais

Do `package.json` raiz e assets carregados em `src/Pages/BodyWrapper.hs`:

- Tailwind CSS
- DaisyUI
- ECharts para graficos
- GridStack para layout drag/drop de dashboards
- HTMX 2
- Hyperscript
- Workbox/service worker
- html2canvas
- Notyf/Tippy/Popper em assets

## Web components

Existe um subprojeto `web-components/` com TypeScript e Vite. O `web-components/package.json` mostra:

- `lit`
- `monaco-editor`
- `echarts`
- `@rrweb/replay`
- `js-yaml`
- `jsonpath`
- `@lit-labs/virtualizer`
- `vite`
- `vitest`

Esse subprojeto parece concentrar componentes mais pesados, como editor de query, visualizacoes e replay, que seriam ruins de manter apenas em HTML server-side.

## Como a UI le dados

Para telas HTML, o cliente normalmente chama endpoints HTMX do proprio backend, e o backend:

1. Carrega dados do banco.
2. Renderiza HTML parcial ou pagina completa.
3. Retorna o HTML para o navegador.

Para dashboards/graficos, os widgets podem ser "eager": o backend executa a query e ja injeta dataset/HTML no widget. Outros widgets renderizam container e fazem fetch/expand depois. Em todos os casos, a leitura passa pelo backend, nao direto do browser para o banco/S3.

## Fontes no codigo

- `package.json`
- `web-components/package.json`
- `src/Pages/BodyWrapper.hs`
- `src/Pages/Dashboards.hs`
- `src/Pkg/Components/Widget.hs`
