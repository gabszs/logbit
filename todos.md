## Integrations

-- adicione rbac nas rotas, hoje, qualquer user que tenha a organiztion consegue esse acessoa as rotas

-- adicionar redacted nos connections

-- adicionar paginacao no invitations e organizations

-- adiconar erro para o failed to fetch quando o server cai, para deixar claro isso

-- adicionar protecao, para que o user nao passe o schema de trace e um source.type=log

-- fazer instrumentacao otel-http funcionar, alem disso o que sao os spans de pre-hook do better-auth?



---
frontend:
4. Sugestões de "Cérebro" para a UI (Contexto Observabilidade)
Framer Motion: Para transições suaves entre estados de filtragem. Em dashboards de dados, movimentos sutis ajudam o usuário a entender para onde um dado "foi" quando um filtro é aplicado.

Nuqs: Uma biblioteca excelente para sincronizar o estado da sua UI (filtros, busca, zoom do gráfico) diretamente com a URL. Isso permite que você envie um link para um colega exatamente com a mesma visão de um incidente.

Date-fns: Essencial para manipular os timeframes de observabilidade (ex: "Last 15 minutes", "Relative time").
---