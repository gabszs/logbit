// dotenv é importado aqui primeiro para cachear o módulo neste worker.
// Quando auth.ts fizer `import "dotenv/config"`, o módulo já estará cacheado
// e NÃO recarregará o .env — evitando que variáveis do .env vazem para os testes.
import "dotenv/config";
import { GenericContainer, Wait } from "testcontainers";

// Overrides de ambiente para testes (rodam DEPOIS dos imports hoistados)
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.ENABLE_OPEN_API = "false";
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:1";

// Remove a restrição de domínio de email que pode estar no .env local
delete process.env.AUTH_ALLOWED_EMAIL_DOMAINS;

const [pg, redis] = await Promise.all([
	new GenericContainer("postgres:15-alpine")
		.withEnvironment({
			POSTGRES_USER: "test",
			POSTGRES_PASSWORD: "test",
			POSTGRES_DB: "testdb",
		})
		.withExposedPorts(5432)
		.withWaitStrategy(
			Wait.forLogMessage("database system is ready to accept connections"),
		)
		.withReuse()
		.start(),

	new GenericContainer("redis:7-alpine")
		.withExposedPorts(6379)
		.withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
		.withReuse()
		.start(),
]);

const pgHost = pg.getHost();
const pgPort = pg.getMappedPort(5432);
const redisHost = redis.getHost();
const redisPort = redis.getMappedPort(6379);

process.env.DATABASE_URL = `postgresql://test:test@${pgHost}:${pgPort}/testdb`;
process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;
