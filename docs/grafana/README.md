# Grafana Datasources: Arquitetura, Plugin System e Encaixe do ClickHouse

## Index

### Documentos desta pasta

- [README.md](/home/gabriel-carvalho/Documents/loglog/docs/grafana/README.md)
- [datasource-models.md](/home/gabriel-carvalho/Documents/loglog/docs/grafana/datasource-models.md)

### Arquivos do Grafana analisados

- [otel/grafana/pkg/services/datasources/models.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/models.go)
- [otel/grafana/pkg/services/datasources/datasources.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/datasources.go)
- [otel/grafana/pkg/services/datasources/service/store.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/store.go)
- [otel/grafana/pkg/services/datasources/service/datasource.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/datasource.go)
- [otel/grafana/pkg/services/datasources/service/datasourceretriever.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/datasourceretriever.go)
- [otel/grafana/pkg/services/sqlstore/migrations/datasource_mig.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrations/datasource_mig.go)
- [otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql)
- [otel/grafana/pkg/plugins/plugins.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/plugins.go)
- [otel/grafana/pkg/plugins/manager/sources/source_local_disk.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/manager/sources/source_local_disk.go)
- [otel/grafana/pkg/plugins/manager/loader/loader.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/manager/loader/loader.go)
- [otel/grafana/pkg/plugins/manager/pipeline/initialization/steps.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/manager/pipeline/initialization/steps.go)
- [otel/grafana/pkg/plugins/backendplugin/provider/provider.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/backendplugin/provider/provider.go)
- [otel/grafana/pkg/plugins/backendplugin/grpcplugin/client.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/backendplugin/grpcplugin/client.go)
- [otel/grafana/pkg/services/pluginsintegration/pluginstore/store.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/pluginsintegration/pluginstore/store.go)
- [otel/grafana/pkg/services/pluginsintegration/plugincontext/plugincontext.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/pluginsintegration/plugincontext/plugincontext.go)
- [otel/grafana/pkg/services/pluginsintegration/adapters/adapters.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/pluginsintegration/adapters/adapters.go)
- [otel/grafana/pkg/api/datasources.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/api/datasources.go)
- [otel/grafana/public/app/features/datasources/api.ts](/home/gabriel-carvalho/Documents/loglog/otel/grafana/public/app/features/datasources/api.ts)
- [otel/grafana/public/app/features/datasources/components/EditDataSource.tsx](/home/gabriel-carvalho/Documents/loglog/otel/grafana/public/app/features/datasources/components/EditDataSource.tsx)
- [otel/grafana/public/app/features/datasources/state/actions.ts](/home/gabriel-carvalho/Documents/loglog/otel/grafana/public/app/features/datasources/state/actions.ts)

### Arquivos do plugin ClickHouse usados como exemplo

- [otel/clickhouse-datasource/src/plugin.json](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/plugin.json)
- [otel/clickhouse-datasource/src/module.ts](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/module.ts)
- [otel/clickhouse-datasource/src/types/config.ts](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/types/config.ts)
- [otel/clickhouse-datasource/src/data/CHDatasource.ts](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/data/CHDatasource.ts)
- [otel/clickhouse-datasource/pkg/main.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/main.go)
- [otel/clickhouse-datasource/pkg/plugin/datasource.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/plugin/datasource.go)
- [otel/clickhouse-datasource/pkg/plugin/driver.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/plugin/driver.go)
- [otel/clickhouse-datasource/pkg/plugin/settings.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/plugin/settings.go)

## Objetivo

Este documento explica em detalhe como o Grafana implementa o sistema de datasources de modo genérico e extensível, permitindo que plugins externos ou core se encaixem sem exigir tabelas específicas para cada integração.

O foco aqui e:

- entender a separacao entre plugin e instancia de datasource
- entender a persistencia em banco
- entender o ciclo de vida de carregamento de plugins
- entender como o Grafana entrega configuracao e credenciais ao plugin
- usar o plugin ClickHouse como estudo de caso concreto

## Resumo executivo

O Grafana resolveu o problema de extensibilidade separando o sistema em duas camadas independentes:

1. Uma camada generica de persistencia e administracao de datasources.
2. Uma camada dinamica de plugins, onde cada plugin declara capacidades e implementa o comportamento real.

Na pratica:

- a tabela `data_source` armazena apenas uma instancia configurada
- o campo `type` da instancia aponta para o `id` do plugin
- configuracoes especificas do plugin ficam em `json_data`
- segredos especificos do plugin ficam em `secure_json_data`
- o frontend do plugin define a experiencia de configuracao e query editor
- o backend do plugin recebe `DataSourceInstanceSettings` e executa o comportamento real

Esse desenho evita migracoes por plugin e permite que qualquer plugin novo entre no sistema desde que respeite o contrato do Grafana Plugin SDK.

## O ponto central: plugin nao e datasource

Essa e a ideia mais importante do sistema.

No Grafana:

- `plugin` = definicao do tipo, capacidades, assets, frontend, backend opcional
- `datasource` = instancia configurada desse tipo, por org

O `plugin` vive no filesystem e e carregado a partir de `plugin.json`.
O `datasource` vive no banco.

O relacionamento entre os dois e feito pelo campo `type`.

Exemplo conceitual:

```text
plugin.id = "grafana-clickhouse-datasource"
data_source.type = "grafana-clickhouse-datasource"
```

Isso quer dizer:

- o banco nao conhece ClickHouse em particular
- o banco so sabe que existe uma instancia cujo tipo aponta para um plugin
- o comportamento concreto e resolvido em tempo de execucao

## Modelo de dados do datasource no Grafana

O modelo de dominio principal esta em [models.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/models.go).

Trecho relevante:

```go
type DataSource struct {
	ID      int64
	OrgID   int64
	Version int

	Name   string
	Type   string
	Access DsAccess
	URL    string
	Password      string
	User          string
	Database      string
	BasicAuth     bool
	BasicAuthUser string
	BasicAuthPassword string
	WithCredentials   bool
	IsDefault         bool
	JsonData          *simplejson.Json
	SecureJsonData    map[string][]byte
	ReadOnly          bool
	UID               string
	APIVersion        string
	IsPrunable        bool
}
```

Essa struct ja mostra a tese da arquitetura:

- colunas comuns ficam como propriedades dedicadas
- campos arbitrarios de plugin ficam em `JsonData`
- segredos arbitrarios ficam em `SecureJsonData`

O modelo de persistencia, portanto, e propositalmente generico.

## Estrutura das tabelas

O schema consolidado aparece em [00-schema.sql](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql).

As tabelas mais importantes para datasources sao:

- `data_source`
- `data_source_acl`
- `data_source_cache`
- `data_source_usage_by_day`

O detalhamento completo esta em [datasource-models.md](/home/gabriel-carvalho/Documents/loglog/docs/grafana/datasource-models.md). Aqui vale ressaltar a tabela principal:

```sql
CREATE TABLE `data_source` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `org_id` bigint NOT NULL,
  `version` int NOT NULL,
  `type` varchar(255) NOT NULL,
  `name` varchar(190) NOT NULL,
  `access` varchar(255) NOT NULL,
  `url` varchar(255) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `user` varchar(255) DEFAULT NULL,
  `database` varchar(255) DEFAULT NULL,
  `basic_auth` tinyint(1) NOT NULL,
  `basic_auth_user` varchar(255) DEFAULT NULL,
  `basic_auth_password` varchar(255) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL,
  `json_data` mediumtext,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL,
  `with_credentials` tinyint(1) NOT NULL DEFAULT '0',
  `secure_json_data` mediumtext,
  `read_only` tinyint(1) DEFAULT NULL,
  `uid` varchar(40) NOT NULL DEFAULT '0',
  `is_prunable` tinyint(1) DEFAULT '0',
  `api_version` varchar(20) DEFAULT NULL
);
```

### O significado arquitetural das colunas

- `type`: chave de ligacao com o plugin
- `uid`: identificador estavel da instancia
- `org_id`: escopo multitenant
- `json_data`: configuracao arbitraria do plugin
- `secure_json_data`: segredos arbitrarios do plugin
- `version`: controle otimista de update
- `is_default`: o datasource padrao da org
- `api_version`: versao da API declarativa de datasource, usada na integracao mais nova

## Evolucao historica da modelagem

As migrations de datasource estao em [datasource_mig.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrations/datasource_mig.go).

A evolucao mostra claramente a direcao do design:

1. O datasource comecou com campos relacionais mais simples.
2. Depois o Grafana adicionou `json_data`.
3. Depois adicionou `secure_json_data`.
4. Depois adicionou `uid`.
5. Depois adicionou `api_version`.

Esse historico importa porque revela a maturacao do sistema:

- primeiro a configuracao comum era suficiente
- com a explosao de plugins, foi necessario um payload flexivel
- quando segredos de plugin se tornaram criticos, surgiu `secure_json_data`
- quando o sistema precisou de identidade estavel, surgiu `uid`

## Como o plugin e descoberto

Os plugins sao encontrados varrendo diretorios de plugins e lendo `plugin.json`. Isso acontece em [source_local_disk.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/manager/sources/source_local_disk.go).

Trecho relevante do fluxo:

```go
// load plugin.json files and map directory to JSON data
for _, pluginJSONPath := range pluginJSONPaths {
	plugin, err := s.readPluginJSON(pluginJSONPath)
	...
	foundPlugins[filepath.Dir(pluginJSONAbsPath)] = plugin
}
```

O parser do arquivo esta em [plugins.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/plugins.go).

Estrutura importante do `plugin.json`:

```go
type JSONData struct {
	ID         string `json:"id"`
	Type       Type   `json:"type"`
	Name       string `json:"name"`
	Backend    bool   `json:"backend"`
	Executable string `json:"executable,omitempty"`

	Annotations bool `json:"annotations"`
	Metrics     bool `json:"metrics"`
	Logs        bool `json:"logs"`
	Tracing     bool `json:"tracing"`
	Alerting    bool `json:"alerting"`
}
```

Para o sistema de datasource, os campos mais importantes sao:

- `id`
- `type`
- `backend`
- `executable`
- capacidades como `logs`, `tracing`, `metrics`

## Como o plugin e carregado

O processo de load esta em [loader.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/manager/loader/loader.go).

Pipeline conceitual:

1. discovery
2. bootstrap
3. validation
4. initialization

Em alto nivel:

```go
discoveredPlugins := l.discovery.Discover(...)
bootstrappedPlugins := l.bootstrap.Bootstrap(...)
validatedPlugins := l.validation.Validate(...)
initializedPlugins := l.initializer.Initialize(...)
```

Esse pipeline e importante porque o Grafana nao acopla datasource ao core em compile time. O plugin entra como bundle carregado em runtime.

## Como o backend do plugin e iniciado

Se `plugin.json.backend` for `true`, o Grafana registra um client backend durante a fase de initialization em [steps.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/manager/pipeline/initialization/steps.go).

Trecho chave:

```go
if p.Backend {
	backendFactory := b.backendProvider.BackendFactory(ctx, p)
	...
	if backendClient, err := backendFactory(p.ID, p.Logger(), b.tracer, envFunc); err != nil {
		return nil, err
	} else {
		p.RegisterClient(backendClient)
	}
}
```

O provider padrao de backend esta em [provider.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/backendplugin/provider/provider.go):

```go
var DefaultProvider = PluginBackendProvider(func(_ context.Context, p *plugins.Plugin) backendplugin.PluginFactoryFunc {
	return grpcplugin.NewBackendPlugin(p.ID, p.ExecutablePath(), p.SkipHostEnvVars)
})
```

Ou seja:

- o Grafana resolve o caminho do executavel do plugin
- cria um client gRPC
- conecta o core ao processo externo do plugin

O client gRPC de backend esta em [grpcplugin/client.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/backendplugin/grpcplugin/client.go), onde o processo e efetivamente invocado:

```go
cfg.Cmd = exec.Command(executablePath, descriptor.executableArgs...)
```

## Como o executavel e resolvido

Em [plugins.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/plugins/plugins.go), o Grafana monta o path do binario a partir de `plugin.json.executable`.

```go
func (p *Plugin) ExecutablePath() string {
	if p.IsRenderer() {
		return p.executablePath("plugin_start")
	}
	return p.executablePath(p.Executable)
}
```

Ele entao gera nomes como:

```text
<executable>_<os>_<arch>
```

No caso do ClickHouse:

- `plugin.json.executable = "gpx_clickhouse"`
- logo o processo esperado sera algo como `gpx_clickhouse_linux_amd64`

## Como a UI lista plugins de datasource

No frontend, a tela de criacao de datasource nao lista linhas da tabela `data_source`. Ela lista metadados de plugin.

O carregamento e feito em [public/app/features/datasources/state/actions.ts](/home/gabriel-carvalho/Documents/loglog/otel/grafana/public/app/features/datasources/state/actions.ts):

```ts
export function loadDataSourcePlugins(): ThunkResult<void> {
  return async (dispatch) => {
    dispatch(dataSourcePluginsLoad());
    const plugins = await api.getDataSourcePlugins();
    const categories = buildCategories(plugins);
    dispatch(dataSourcePluginsLoaded({ plugins, categories }));
  };
}
```

E a API chamada e:

```ts
export const getDataSourcePlugins = () => getBackendSrv().get('/api/plugins', { enabled: 1, type: 'datasource' });
```

Isso reforca a separacao:

- criacao: guiada por plugins disponiveis
- configuracao concreta: salva em `data_source`

## Como uma instancia de datasource e criada

Quando o usuario escolhe um plugin e salva a configuracao, o Grafana cria uma linha em `data_source`.

No backend, isso acontece em [store.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/store.go), em `AddDataSource`.

Trecho central:

```go
ds = &datasources.DataSource{
	OrgID:           cmd.OrgID,
	Name:            cmd.Name,
	Type:            cmd.Type,
	Access:          cmd.Access,
	URL:             cmd.URL,
	User:            cmd.User,
	Database:        cmd.Database,
	IsDefault:       cmd.IsDefault,
	BasicAuth:       cmd.BasicAuth,
	BasicAuthUser:   cmd.BasicAuthUser,
	WithCredentials: cmd.WithCredentials,
	JsonData:        cmd.JsonData,
	SecureJsonData:  cmd.EncryptedSecureJsonData,
	Version:         1,
	UID:             cmd.UID,
	IsPrunable:      cmd.IsPrunable,
	APIVersion:      cmd.APIVersion,
}
```

Aqui fica explicito que o core nao precisa conhecer a estrutura interna do plugin. Ele so persiste:

- `Type`
- `JsonData`
- `SecureJsonData`

## Como uma instancia e recuperada

O retrieval basico fica em [datasourceretriever.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/datasourceretriever.go) e [store.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/store.go).

O lookup mais importante e:

```go
datasource := &datasources.DataSource{
	OrgID: query.OrgID,
	UID:   query.UID,
	Name:  query.Name,
	ID:    query.ID,
	Type:  query.Type,
}
has, err := sess.Get(datasource)
```

Observe um detalhe importante:

- a busca pode ser por `UID`, `ID`, `Name`
- opcionalmente pode restringir por `Type`

Esse detalhe ajuda o Grafana a trabalhar com alias de plugins e com a API mais nova.

## Como o plugin e associado a instancia salva

Quando o Grafana precisa interagir com uma instancia de datasource, ele usa o `type` salvo na linha do banco para buscar o plugin correspondente no plugin store.

Em [pkg/api/datasources.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/api/datasources.go):

```go
plugin, exists := hs.pluginStore.Plugin(c.Req.Context(), ds.Type)
if !exists {
	c.JsonApiErr(http.StatusInternalServerError, "Unable to find datasource plugin", err)
	return
}
```

Esse e o acoplamento real entre banco e runtime.

## Como a configuracao do banco vira settings do plugin

Esse e um dos pontos mais importantes do desenho.

O Grafana converte o `datasources.DataSource` do banco para `backend.DataSourceInstanceSettings`, que e o contrato do Plugin SDK.

Isso acontece em [adapters.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/pluginsintegration/adapters/adapters.go):

```go
return &backend.DataSourceInstanceSettings{
	Type:                    ds.Type,
	ID:                      ds.ID,
	Name:                    ds.Name,
	URL:                     ds.URL,
	UID:                     ds.UID,
	Database:                ds.Database,
	User:                    ds.User,
	BasicAuthEnabled:        ds.BasicAuth,
	BasicAuthUser:           ds.BasicAuthUser,
	JSONData:                jsonDataBytes,
	DecryptedSecureJSONData: decrypted,
	Updated:                 ds.Updated,
	APIVersion:              ds.APIVersion,
}, err
```

Ou seja, o plugin backend nao fala diretamente com a tabela `data_source`.
Ele recebe um objeto normalizado pelo Grafana.

## Como o PluginContext e montado

Em [plugincontext.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/pluginsintegration/plugincontext/plugincontext.go), o Grafana monta o contexto que sera enviado ao plugin.

Para datasource:

```go
func (p *Provider) GetWithDataSource(ctx context.Context, pluginID string, user identity.Requester, ds *datasources.DataSource) (backend.PluginContext, error) {
	plugin, exists := p.pluginStore.Plugin(ctx, pluginID)
	...
	datasourceSettings, err := adapters.ModelToInstanceSettings(ds, p.decryptSecureJsonDataFn(ctx))
	...
	pCtx.DataSourceInstanceSettings = datasourceSettings
	return pCtx, nil
}
```

Isso quer dizer que o Grafana:

1. resolve o plugin por `pluginID`
2. resolve a instancia salva do banco
3. decripta os segredos
4. monta `PluginContext`
5. chama o backend do plugin

## O truque que torna o sistema extensivel

O truque esta em combinar:

- metadados declarativos do plugin em `plugin.json`
- persistencia generica no banco
- um payload livre em `json_data`
- um payload seguro livre em `secure_json_data`
- um contrato estavel do SDK (`DataSourceInstanceSettings`)

Isso elimina a necessidade de:

- criar tabela por plugin
- criar coluna por variacao de config
- alterar o core sempre que um novo datasource aparece

O core so precisa saber:

- identificar o plugin
- armazenar configuracao generica
- decriptar segredos
- montar contexto
- entregar chamadas ao plugin

## Estudo de caso: ClickHouse

O plugin ClickHouse encaixa exatamente nesse modelo.

### Declaracao do plugin

Em [src/plugin.json](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/plugin.json):

```json
{
  "type": "datasource",
  "id": "grafana-clickhouse-datasource",
  "backend": true,
  "logs": true,
  "tracing": true,
  "metrics": true,
  "alerting": true,
  "annotations": true,
  "executable": "gpx_clickhouse"
}
```

Isso informa ao Grafana:

- este bundle e um datasource
- ele tem backend
- ele suporta logs, traces, metrics e annotations
- o processo backend deve ser iniciado a partir de `gpx_clickhouse`

### Frontend do plugin

Em [src/module.ts](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/module.ts):

```ts
export const plugin = new DataSourcePlugin<Datasource, CHQuery, CHConfig>(Datasource)
  .setConfigEditor(configEditor)
  .setQueryEditor(CHQueryEditor);
```

Aqui o plugin registra:

- a classe principal do datasource
- o editor de configuracao
- o editor de query

Ou seja, a UI do Grafana nao precisa conhecer ClickHouse. Ela so renderiza o que o plugin exporta.

### Modelo de configuracao do plugin

Em [src/types/config.ts](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/src/types/config.ts), o plugin declara o shape da configuracao esperada.

Trecho importante:

```ts
export interface CHConfig extends DataSourceJsonData {
  host: string;
  port: number;
  protocol: Protocol;
  secure?: boolean;
  path?: string;
  username: string;
  defaultDatabase?: string;
  logs?: CHLogsConfig;
  traces?: CHTracesConfig;
  httpHeaders?: CHHttpHeader[];
  customSettings?: CHCustomSetting[];
  enableRowLimit?: boolean;
}
```

Esses campos nao viram colunas novas em `data_source`.
Eles sao serializados dentro de `json_data`.

Os segredos do plugin:

```ts
type CHSecureConfigProperties = {
  password?: string;
  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}
```

Esses vao para `secure_json_data`.

### Backend do plugin

O processo backend comeca em [pkg/main.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/main.go):

```go
func main() {
	if err := datasource.Manage("grafana-clickhouse-datasource", plugin.NewDatasource, datasource.ManageOpts{}); err != nil {
		...
	}
}
```

O backend espera receber um datasource do tipo `grafana-clickhouse-datasource`, exatamente o mesmo valor que o Grafana salva em `data_source.type`.

### Como o plugin le as settings persistidas

Em [pkg/plugin/settings.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/plugin/settings.go), o plugin backend le o payload entregue pelo Grafana:

```go
func LoadSettings(ctx context.Context, config backend.DataSourceInstanceSettings) (settings Settings, err error) {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(config.JSONData, &jsonData); err != nil {
		...
	}
	...
	password, ok := config.DecryptedSecureJSONData["password"]
	if ok {
		settings.Password = password
	}
}
```

Esse trecho e crucial para entender o sistema:

- `config.JSONData` veio do `data_source.json_data`
- `config.DecryptedSecureJSONData` veio do `data_source.secure_json_data`

O plugin apenas consome o contrato entregue pelo Grafana.

### Como o ClickHouse usa essas settings

Depois de carregar os settings, o plugin monta a conexao real em [driver.go](/home/gabriel-carvalho/Documents/loglog/otel/clickhouse-datasource/pkg/plugin/driver.go).

```go
opts := &clickhouse.Options{
	Addr: []string{fmt.Sprintf("%s:%d", settings.Host, settings.Port)},
	Auth: clickhouse.Auth{
		Database: settings.DefaultDatabase,
		Password: settings.Password,
		Username: settings.Username,
	},
	HttpUrlPath: settings.Path,
	Protocol:    protocol,
	TLS:         tlsConfig,
}
db := clickhouse.OpenDB(opts)
```

Portanto:

- o Grafana armazena e entrega configuracao
- o plugin ClickHouse decide como mapear isso para o driver oficial `clickhouse-go/v2`

## O que o banco realmente guarda para o ClickHouse

Uma linha de exemplo conceitual em `data_source` para ClickHouse ficaria perto disso:

```json
{
  "id": 42,
  "org_id": 1,
  "uid": "clickhouse-main",
  "name": "ClickHouse",
  "type": "grafana-clickhouse-datasource",
  "access": "proxy",
  "url": "http://clickhouse:8123",
  "user": "default",
  "database": "",
  "json_data": {
    "host": "clickhouse",
    "port": 8123,
    "protocol": "http",
    "secure": false,
    "username": "default",
    "defaultDatabase": "otel",
    "logs": {
      "defaultTable": "otel_logs",
      "otelEnabled": true,
      "otelVersion": "latest"
    },
    "traces": {
      "defaultTable": "otel_traces",
      "otelEnabled": true,
      "otelVersion": "latest"
    }
  },
  "secure_json_data": {
    "password": "...",
    "tlsCACert": "...",
    "tlsClientCert": "...",
    "tlsClientKey": "..."
  }
}
```

O schema da tabela continua o mesmo para qualquer outro plugin.

## Como a UI de edicao usa o plugin

Na tela de edicao do datasource, o Grafana resolve tanto a instancia quanto o plugin. Isso pode ser visto em [EditDataSource.tsx](/home/gabriel-carvalho/Documents/loglog/otel/grafana/public/app/features/datasources/components/EditDataSource.tsx).

Trecho importante:

```tsx
const dataSource = useDataSource(uid);
const dataSourceMeta = useDataSourceMeta(dataSource.type);
...
{plugin && (
  <DataSourcePluginContextProvider instanceSettings={dsi}>
    <DataSourcePluginSettings
      plugin={plugin}
      dataSource={dataSourceWithIsPDCInjected}
      dataSourceMeta={dataSourceMeta}
      onModelChange={onOptionsChange}
    />
  </DataSourcePluginContextProvider>
)}
```

Aqui novamente vemos a separacao:

- `dataSource` = instancia salva
- `plugin` = implementacao de UI do tipo

## O papel de `type` e o contrato de compatibilidade

O campo `type` tem um papel mais profundo do que um simples label:

- ele determina qual plugin sera encontrado no plugin store
- ele determina qual frontend sera renderizado
- ele determina qual backend sera chamado
- ele determina como `json_data` sera interpretado

Em outras palavras, `type` e o identificador semantico do protocolo entre o core e o plugin.

## Por que essa arquitetura escala bem

Ela escala porque o Grafana evita criar conhecimento de dominio no core.

O core centraliza apenas:

- descoberta de plugins
- lifecycle dos processos backend
- persistencia generica
- secrets
- ACL
- cache
- PluginContext
- roteamento HTTP e gRPC

Cada plugin centraliza:

- UX de configuracao
- query editor
- shape do `jsonData`
- shape do `secureJsonData`
- execucao real
- transformacoes de resposta

Esse desacoplamento reduz o custo de adicionar novos datasources.

## Consequencias praticas para o desenho do seu proprio sistema

Se voce quiser reproduzir um modelo parecido no `loglog`, as escolhas essenciais sao:

1. Ter uma tabela generica de conexoes/datasources.
2. Salvar `plugin_type` como chave para o runtime.
3. Ter `config_json` para configuracoes livres.
4. Ter `secure_config_json` ou secrets referenciados externamente.
5. Definir um contrato unico de runtime para entregar a configuracao ao plugin.
6. Tratar frontend e backend do plugin como componentes substituiveis.

Uma modelagem minimalista inspirada no Grafana seria:

```sql
CREATE TABLE data_source (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL,
  uid VARCHAR(40) NOT NULL,
  name VARCHAR(190) NOT NULL,
  type VARCHAR(255) NOT NULL,
  access VARCHAR(50) NOT NULL,
  url TEXT,
  username TEXT,
  database_name TEXT,
  json_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  secure_json_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  read_only BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE (org_id, uid),
  UNIQUE (org_id, name)
);
```

## Conclusao

O sistema de datasource do Grafana funciona porque ele trata datasource como uma entidade generica e plugin como comportamento dinamico.

O banco guarda:

- identidade
- ownership
- configuracao comum
- blobs genericos de configuracao

O plugin define:

- como configurar
- como consultar
- como interpretar os blobs
- como executar chamadas externas

O plugin ClickHouse encaixa perfeitamente nesse modelo:

- `plugin.json.id` e a chave do tipo
- `json_data` guarda host, porta, protocolo, logs/traces, headers e settings
- `secure_json_data` guarda senha e material TLS
- o Grafana converte isso para `DataSourceInstanceSettings`
- o backend do plugin transforma isso em uma conexao concreta com ClickHouse

Esse e o motivo de o Grafana conseguir suportar muitos plugins diferentes sem multiplicar tabelas ou paths especiais no core.
