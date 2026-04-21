# Model de Log Source (HyperDX): regras por campo

## Objetivo
Este documento resume, em formato descritivo, as regras práticas dos campos principais de uma `source` do tipo `log` no HyperDX, com foco em:
- como cada campo influencia a consulta
- quando cada campo é usado
- exemplos básicos de queries do usuário

---

## Campo: `timestampValueExpression`

### O que é
É o campo/expressão de tempo **base da query**.  
Funciona como o "relógio oficial" da consulta.

### Onde impacta
- filtro de período (`WHERE` com intervalo de tempo)
- agregações por tempo (bucket de 1m, 5m, 1h, etc.)
- funções de análise temporal (rate/delta/janelas)
- otimizações de leitura orientadas por tempo

### Exemplo
Se `timestampValueExpression = "Timestamp"`:

```sql
WHERE Timestamp >= now() - INTERVAL 15 MINUTE
```

Se trocar para `IngestedAt`, toda a lógica temporal da query passa a usar `IngestedAt`.

---

## Campo: `displayedTimestampValueExpression`

### O que é
Campo/expressão de tempo usado para **exibição** (e em alguns fluxos, ordenação de tela).

### Diferença para `timestampValueExpression`
- `timestampValueExpression`: tempo de cálculo da query
- `displayedTimestampValueExpression`: tempo mostrado para o usuário

### Regra prática
Se só existe um timestamp na tabela, normalmente os dois podem ser iguais.  
Se existem dois tempos (ex.: `event_time` e `ingest_time`), costuma-se usar:
- cálculo: `ingest_time` (performance/particionamento)
- exibição: `event_time` (semântica do evento)

---

## Campo: `orderByExpression`

### O que é
Campo que define **diretamente** o `ORDER BY` padrão.

### Regra de precedência
1. Se `orderByExpression` estiver preenchido, ele manda.
2. Se não estiver, entra fallback por timestamp (`displayedTimestampValueExpression` e/ou `timestampValueExpression`, dependendo do fluxo).

### Exemplo
```sql
ORDER BY Timestamp DESC
```

---

## Campo: `implicitColumnExpression`

### O que é
É a coluna padrão para busca de texto livre (Lucene) quando o usuário **não** informa campo.

### Quando é aplicado
Aplica em consultas como:
- `timeout`
- `"connection refused"`
- `error OR failed`
- `-healthcheck`

Nesses casos, a busca é direcionada para o `implicitColumnExpression`.

### Quando não é aplicado
Quando o usuário já informa campo explicitamente:
- `SeverityText:ERROR`
- `ServiceName:api AND Body:timeout`
- `TraceId:"abc123"`

### Exemplos
Se `implicitColumnExpression = "Body"` e o usuário busca:
- `timeout`

Interpretação equivalente:

```sql
WHERE Body ILIKE '%timeout%'
```

Se a busca for:
- `timeout AND error`

Interpretação equivalente:

```sql
WHERE Body ILIKE '%timeout%'
  AND Body ILIKE '%error%'
```

### Múltiplos valores
Aceita múltiplas expressões separadas por vírgula.

Exemplo:
- `implicitColumnExpression = "Body, Message"`

Nesse caso a busca livre pode ser aplicada sobre a combinação dos campos.

---

## Campo: `bodyExpression`

### O que é
Define qual coluna/expressão representa o corpo principal da mensagem de log.

### Onde impacta
- renderização do conteúdo principal da linha de log
- leitura humana do evento (mensagem)
- consultas e painéis que tratam "mensagem" como campo principal

### Exemplo comum
- `bodyExpression = "Body"`

---

## Campo: `traceIdExpression`

### O que é
Define de onde extrair o `trace_id` no log.

### Onde impacta
- correlação de logs com traces
- navegação do log para o trace
- queries de drill-down por trace

### Exemplo comum
- `traceIdExpression = "TraceId"`

---

## Campo: `spanIdExpression`

### O que é
Define de onde extrair o `span_id` no log.

### Onde impacta
- correlação fina do log com spans específicos
- navegação contextual no trace

### Exemplo comum
- `spanIdExpression = "SpanId"`

---

## Exemplo mínimo de configuração (log source)

```json
{
  "kind": "log",
  "timestampValueExpression": "Timestamp",
  "displayedTimestampValueExpression": "Timestamp",
  "orderByExpression": "Timestamp DESC",
  "implicitColumnExpression": "Body",
  "bodyExpression": "Body",
  "traceIdExpression": "TraceId",
  "spanIdExpression": "SpanId"
}
```

---

## Exemplo com dois timestamps

```json
{
  "kind": "log",
  "timestampValueExpression": "IngestedAt",
  "displayedTimestampValueExpression": "EventTime",
  "implicitColumnExpression": "Body",
  "bodyExpression": "Body",
  "traceIdExpression": "trace_id",
  "spanIdExpression": "span_id"
}
```

Uso esperado:
- filtros e agregações temporais usam `IngestedAt`
- usuário visualiza tempo de evento via `EventTime`

---

## Resumo rápido
- `timestampValueExpression`: tempo de cálculo da query
- `displayedTimestampValueExpression`: tempo exibido
- `orderByExpression`: ordenação explícita (quando definido)
- `implicitColumnExpression`: alvo de busca livre sem campo
- `bodyExpression`: mensagem principal do log
- `traceIdExpression` / `spanIdExpression`: correlação com tracing
