import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(settings.DATABASE_URL!);
export const db = drizzle({ client });
