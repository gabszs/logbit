## Integrations

-- forcar o envio manual das mtricas quando fechar a tela no frontend

-- investigar acumulo de memoria no front, ele salva todos os logs?!

-- arrumar bug nao redenrizar trace completo na primeira linha

-- arrumar bug animacao do painel de traces

-- adiconar botao refrash trace -> no primeiro click nao vai, mas se saiu e volto denovo ele recarrega

-- implementar displayedTimestampField

-- implemntar o trace no sources

-- fazer ajsuter para o panel definisir se e log ou trace a partir do source.type

-- dentro de results table, nos botoes finais, ele apagando a linha abaixo

-- analisar o open-observe e ver qual lib eles usam na visualizacao

-- adicione rbac nas rotas, hoje, qualquer user que tenha a organiztion consegue esse acessoa as rotas

-- adicionar redacted nos connections

-- adicionar UI de paginacao no invitations e organizations

-- adiconar erro para o failed to fetch quando o server cai, para deixar claro isso

-- fazer instrumentacao otel-http funcionar, alem disso o que sao os spans de pre-hook do better-auth?

-- arrumar testes do middelware de front end que aparenta nao esta funcionando quando ativado, tbm nao ta tendo trace quando eu dipsaro reqeust normal (mas pode ser a rota)

-- adicionar visualizacao do proprio clickhouse, quanto gb tem cada tabela, quantos logs/traces, maiores metricas, metricas mais frequentes, metricas com maior cardinaldiade

---
frontend:
4. Sugestões de "Cérebro" para a UI (Contexto Observabilidade)
Framer Motion: Para transições suaves entre estados de filtragem. Em dashboards de dados, movimentos sutis ajudam o usuário a entender para onde um dado "foi" quando um filtro é aplicado.

Nuqs: Uma biblioteca excelente para sincronizar o estado da sua UI (filtros, busca, zoom do gráfico) diretamente com a URL. Isso permite que você envie um link para um colega exatamente com a mesma visão de um incidente.

Date-fns: Essencial para manipular os timeframes de observabilidade (ex: "Last 15 minutes", "Relative time").
---
