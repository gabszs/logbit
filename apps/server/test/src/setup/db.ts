import { sql } from "drizzle-orm";
import type { dbType } from "@/db";

export async function truncateAllTables(database: dbType) {
	await database.execute(sql`
        DO $$ 
        DECLARE 
            r RECORD;
        BEGIN
            -- Busca todas as tabelas no schema public e as concatena
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
            END LOOP;
        END $$;
    `);
}
