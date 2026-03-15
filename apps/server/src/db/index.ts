import 'dotenv/config';
import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';

const client = new SQL({
	url: process.env.DATABASE_URL!,
	max: process.env.DATABASE_MAX_CONNECTIONS,
	
});
const db = drizzle({ client });
