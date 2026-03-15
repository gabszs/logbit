import { drizzle } from "drizzle-orm/d1";
import { providers } from "../src/models/provider";

export async function addProvider(
	d1: D1Database,
	providerData: { id: string; name: string; link: string },
) {
	const db = drizzle(d1); // conecta com o D1 usando o binding
	const _result = await db.insert(providers).values(providerData).run();
}
