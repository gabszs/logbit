# Grafana Datasource Models e Persistencia em Banco

## Index

- [README.md](/home/gabriel-carvalho/Documents/loglog/docs/grafana/README.md)
- [datasource-models.md](/home/gabriel-carvalho/Documents/loglog/docs/grafana/datasource-models.md)

## Fontes principais

- [otel/grafana/pkg/services/datasources/models.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/models.go)
- [otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql)
- [otel/grafana/pkg/services/sqlstore/migrations/datasource_mig.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrations/datasource_mig.go)
- [otel/grafana/pkg/services/datasources/service/store.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/store.go)

## 1. Model de dominio principal

Em [models.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/models.go), o Grafana define a entidade `DataSource`.

```go
type DataSource struct {
	ID      int64 `json:"id,omitempty" xorm:"pk autoincr 'id'"`
	OrgID   int64 `json:"orgId,omitempty" xorm:"org_id"`
	Version int   `json:"version,omitempty"`

	Name   string   `json:"name"`
	Type   string   `json:"type"`
	Access DsAccess `json:"access"`
	URL    string   `json:"url" xorm:"url"`
	Password      string `json:"-"`
	User          string `json:"user"`
	Database      string `json:"database"`
	BasicAuth     bool   `json:"basicAuth"`
	BasicAuthUser string `json:"basicAuthUser"`
	BasicAuthPassword string            `json:"-"`
	WithCredentials   bool              `json:"withCredentials"`
	IsDefault         bool              `json:"isDefault"`
	JsonData          *simplejson.Json  `json:"jsonData"`
	SecureJsonData    map[string][]byte `json:"secureJsonData"`
	ReadOnly          bool              `json:"readOnly"`
	UID               string            `json:"uid" xorm:"uid"`
	APIVersion        string            `json:"apiVersion" xorm:"api_version"`
	IsPrunable        bool              `xorm:"is_prunable"`

	Created time.Time `json:"created,omitempty"`
	Updated time.Time `json:"updated,omitempty"`
}
```

## 2. Tabela `data_source`

Schema atual em [00-schema.sql](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql:874):

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
  `api_version` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQE_data_source_org_id_name` (`org_id`,`name`),
  UNIQUE KEY `UQE_data_source_org_id_uid` (`org_id`,`uid`),
  KEY `IDX_data_source_org_id` (`org_id`),
  KEY `IDX_data_source_org_id_is_default` (`org_id`,`is_default`)
);
```

### Leitura semantica

- `id`: PK interna
- `org_id`: escopo multitenant
- `version`: optimistic locking
- `type`: ID do plugin
- `name`: nome visivel da instancia
- `access`: `proxy` ou `direct`
- `url`: endpoint base da conexao
- `password`: legado
- `user`: campo generico legado
- `database`: campo generico legado
- `basic_auth`, `basic_auth_user`, `basic_auth_password`: auth HTTP generica, em parte legado
- `is_default`: datasource default da org
- `json_data`: configuracao arbitraria do plugin
- `secure_json_data`: segredos arbitrarios do plugin
- `uid`: identificador estavel
- `read_only`: trava de edicao
- `is_prunable`: suporte a provision pruning
- `api_version`: integracao com a API declarativa mais nova

## 3. Tabela `data_source_acl`

Schema em [00-schema.sql](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql:912):

```sql
CREATE TABLE `data_source_acl` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `org_id` bigint NOT NULL,
  `data_source_id` bigint NOT NULL,
  `team_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `permission` smallint NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQE_data_source_acl_data_source_id_team_id_user_id` (`data_source_id`,`team_id`,`user_id`),
  KEY `IDX_data_source_acl_data_source_id` (`data_source_id`)
);
```

Funcao:

- guardar ACL por datasource para usuarios e teams
- permitir que permissao seja modelada por instancia, nao por plugin

## 4. Tabela `data_source_cache`

Schema em [00-schema.sql](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrator/snapshot/00-schema.sql:933):

```sql
CREATE TABLE `data_source_cache` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `data_source_id` bigint NOT NULL,
  `enabled` tinyint(1) NOT NULL,
  `ttl_ms` bigint NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL,
  `use_default_ttl` tinyint(1) NOT NULL DEFAULT '1',
  `data_source_uid` varchar(40) NOT NULL DEFAULT '0',
  `ttl_resources_ms` bigint NOT NULL DEFAULT '300000',
  PRIMARY KEY (`id`),
  KEY `IDX_data_source_cache_data_source_id` (`data_source_id`),
  KEY `IDX_data_source_cache_data_source_uid` (`data_source_uid`)
);
```

Funcao:

- guardar policy de cache por instancia de datasource

## 5. Tabela `data_source_usage_by_day`

A tabela aparece logo abaixo no snapshot consolidado.

Funcao:

- guardar metricas agregadas de uso por datasource e dia
- numero de queries
- numero de erros
- tempo acumulado de carga

## 6. Commands de criacao e update

Os DTOs de escrita estao em [models.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/models.go).

### AddDataSourceCommand

```go
type AddDataSourceCommand struct {
	Name            string
	Type            string
	Access          DsAccess
	URL             string
	User            string
	Database        string
	BasicAuth       bool
	BasicAuthUser   string
	WithCredentials bool
	IsDefault       bool
	JsonData        *simplejson.Json
	SecureJsonData  map[string]string
	UID             string
	APIVersion      string
	...
}
```

### UpdateDataSourceCommand

```go
type UpdateDataSourceCommand struct {
	Name            string
	Type            string
	Access          DsAccess
	URL             string
	User            string
	Database        string
	BasicAuth       bool
	BasicAuthUser   string
	WithCredentials bool
	IsDefault       bool
	JsonData        *simplejson.Json
	SecureJsonData  map[string]string
	UID             string
	APIVersion      string
	Version         int
	...
}
```

Esses comandos deixam muito claro que:

- o plugin define o shape do JSON
- o core apenas transporta e persiste esse JSON

## 7. Como o store popula a linha do banco

Em [store.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/datasources/service/store.go), o `AddDataSource` monta a entidade persistida.

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
	Created:         time.Now(),
	Updated:         time.Now(),
	Version:         1,
	ReadOnly:        cmd.ReadOnly,
	UID:             cmd.UID,
	IsPrunable:      cmd.IsPrunable,
	APIVersion:      cmd.APIVersion,
}
```

Em update, o mesmo principio vale:

- `Type` continua sendo o plugin ID
- `JsonData` e `SecureJsonData` sao sobrescritos/atualizados
- `Version` incrementa

## 8. Evolucao das migrations

As migrations mostram a estrategia de extensibilidade sendo adicionada ao longo do tempo.

Pontos importantes em [datasource_mig.go](/home/gabriel-carvalho/Documents/loglog/otel/grafana/pkg/services/sqlstore/migrations/datasource_mig.go):

- `json_data` foi adicionado na v2 da tabela
- `secure_json_data` foi adicionado depois
- `uid` foi adicionado depois
- `api_version` foi adicionado depois

Trechos representativos:

```go
mg.AddMigration("Add secure json data column", NewAddColumnMigration(tableV2, &Column{
	Name: "secure_json_data", Type: DB_Text, Nullable: true,
}))
```

```go
mg.AddMigration("Add uid column", NewAddColumnMigration(tableV2, &Column{
	Name: "uid", Type: DB_NVarchar, Length: 40, Nullable: false, Default: "0",
}))
```

```go
mg.AddMigration("Add api_version column", NewAddColumnMigration(tableV2, &Column{
	Name: "api_version", Type: DB_Varchar, Nullable: true, Length: 20,
}))
```

## 9. O que fica em `json_data`

Em termos praticos, `json_data` contem tudo que for plugin-specific e nao secreto.

Exemplos:

- host e port especificos do datasource
- timeouts
- headers nao secretos
- flags de comportamento
- mapeamento de colunas
- configuracao de logs/traces
- versoes de semantica OTEL

No caso do ClickHouse, isso inclui coisas como:

```ts
type CHConfig = {
  host: string;
  port: number;
  protocol: "native" | "http";
  secure?: boolean;
  path?: string;
  username: string;
  defaultDatabase?: string;
  logs?: {...};
  traces?: {...};
  httpHeaders?: {...}[];
  customSettings?: {...}[];
}
```

## 10. O que fica em `secure_json_data`

Em termos praticos, `secure_json_data` guarda qualquer segredo dependente do plugin.

Exemplos gerais:

- senha
- token
- client secret
- material TLS
- header seguro

No ClickHouse:

- `password`
- `tlsCACert`
- `tlsClientCert`
- `tlsClientKey`

## 11. Exemplo de linha persistida

Exemplo didatico de uma linha ClickHouse:

```json
{
  "org_id": 1,
  "uid": "clickhouse-otel",
  "name": "ClickHouse OTel",
  "type": "grafana-clickhouse-datasource",
  "access": "proxy",
  "url": "http://clickhouse:8123",
  "user": "default",
  "database": "",
  "basic_auth": false,
  "is_default": false,
  "json_data": {
    "host": "clickhouse",
    "port": 8123,
    "protocol": "http",
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
    "password": "encrypted",
    "tlsCACert": "encrypted"
  }
}
```

## 12. Conclusao

As models persistidas do Grafana foram desenhadas para serem:

- genericas
- multitenant
- versionadas
- compatíveis com plugins arbitrarios

O banco nao modela cada integracao.
Ele modela apenas:

- a instancia
- o tipo do plugin
- configuracao livre
- segredos livres
- ACL e cache ao redor da instancia

Esse e o pilar que torna o sistema de datasources do Grafana extensivel.
