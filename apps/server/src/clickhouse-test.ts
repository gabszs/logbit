import { createClickhouseClient } from "./integrations/clickhouse";

async function run() {
	// --- sem database ---
	const clientNoDB = createClickhouseClient({
		url: "http://192.168.1.3:8125",
		database: null,
		username: "default",
		password: "clickhouse",
	});

	console.log("=== sem database ===");
	console.log("ping:", await clientNoDB.ping());

	const dbsNoDB = await clientNoDB.query({ query: "SHOW DATABASES" });
	console.log("databases (sem database):", await dbsNoDB.json());

	await clientNoDB.close();

	// --- com database ---
	const clientWithDB = createClickhouseClient({
		url: "http://192.168.1.3:8125",
		database: "default",
		username: "default",
		password: "clickhouse",
	});

	console.log("\n=== com database=default ===");
	console.log("ping:", await clientWithDB.ping());

	const dbsWithDB = await clientWithDB.query({ query: "SHOW DATABASES" });
	console.log("databases (com database):", await dbsWithDB.json());

	await clientWithDB.close();
}

run().catch((err) => {
	console.error("error:", err);
	process.exit(1);
});
