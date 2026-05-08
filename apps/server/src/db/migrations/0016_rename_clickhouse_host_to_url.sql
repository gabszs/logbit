UPDATE "connections"
SET "config" = jsonb_set(
	"config" - 'host',
	'{url}',
	COALESCE("config"->'url', "config"->'host'),
	true
)
WHERE "type" = 'clickhouse'
	AND "config" ? 'host';
