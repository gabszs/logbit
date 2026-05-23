# Email reports e notificacoes

## Tipos de reports

O backend define jobs:

- `DailyReports ProjectId`
- `WeeklyReports ProjectId`
- `ReportUsage ProjectId`

O report operacional principal e gerado por `sendReportForProject` em `src/BackgroundJobs.hs`.

## Agendamento

`DailyJob` roda com lock advisory para evitar duplicacao em varios pods. Ele agenda:

- hourly jobs do dia;
- jobs por projeto ativo;
- `ReportUsage`;
- `WeeklyReports` nas segundas-feiras;
- outros jobs de monitoramento, patterns, facets e cleanup.

`ensureDailyJobScheduled` garante que pelo menos um `DailyJob` esteja na fila.

## Como gera report

`sendReportForProject`:

1. Define janela: 24h para daily, 6 dias para weekly.
2. Busca stats atuais e periodo anterior.
3. Busca stats por span type.
4. Busca slow DB queries.
5. Busca endpoint stats.
6. Busca dados para charts de eventos e erros.
7. Busca anomalies/issues.
8. Monta `report_json` via `Pages.Reports.buildReportJson'`.
9. Salva em `apis.reports`.
10. Se notificacoes estiverem habilitadas, envia para canais configurados.

## Onde salva

Reports historicos ficam em `apis.reports`:

- `id`
- `project_id`
- `report_type`
- `report_json`
- `start_time`
- `end_time`
- timestamps

A pagina de reports le essa tabela, reconstrui HTML do email e renderiza em iframe.

## Email HTML

`src/Pkg/EmailTemplates.hs` define `WeeklyReportData` e `weeklyReportEmail`.

`src/Pages/Reports.hs` tem `renderWeeklyEmail`, usado para:

- Gerar preview/live report.
- Reconstruir email HTML de um report salvo.
- Gerar URLs assinadas de PNG para charts.

`sendRenderedEmail` em `src/Pkg/Mail.hs` envia pelo efeito `Notify.emailNotification`, que por sua vez usa configuracao SMTP/SendGrid/Courier conforme ambiente.

## Canais de notificacao

A mesma estrutura `NotificationAlerts` suporta:

- Email
- Slack
- Discord
- WhatsApp
- PagerDuty

Para report, existe `ReportAlert`, formatado por canal.

## Tecnicas usadas

- Reports sao assicronos via `odd-jobs`.
- Idempotencia/concorrencia do scheduler com advisory lock e checagem de jobs existentes.
- Comparacao com periodo anterior para calcular delta.
- Pre-signed/signed widget PNG URL para embutir chart no email/canal.
- Armazenamento do `report_json`, permitindo reabrir report historico.
- Notificacao por equipe/canais usando "everyone team".
- Bots conseguem detectar intencao de report e buscar o ultimo report salvo.

## Fontes no codigo

- `src/BackgroundJobs.hs`
- `src/Pages/Reports.hs`
- `src/Pkg/EmailTemplates.hs`
- `src/Pkg/Mail.hs`
- `src/Models/Apis/Issues.hs`
- `src/Pages/Bots/Utils.hs`
