import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
	gt,
	gte,
	type InferInsertModel,
	type InferSelectModel,
	lt,
	lte,
	type SQL,
	sql,
} from "drizzle-orm";
import type { AnyPgSelect, PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { dbType } from "@/db";
import type { searchOptionsSchema } from "../schemas/baseSchemas";
import type { IRepository } from "./IRepository";

type FilterValue = string | number | boolean | Date | null;
type Filters = Record<string, FilterValue>;

/**
 * Tipo estrutural mínimo para qualquer query builder do Drizzle que aceite cláusula 'where'.
 */
type DrizzleQuery = {
	where(condition: SQL | undefined): unknown;
};

type ApplyQueryOptionsArgs<Q extends DrizzleQuery> = {
	query: Q;
	searchOptions?: searchOptionsSchema | null;
	filters?: Filters | null;
};

export abstract class BaseSqlRepository<Model extends PgTable>
    implements
        IRepository<
            InferSelectModel<Model>,            // TData
            InferInsertModel<Model>,            // TCreate
            Partial<InferInsertModel<Model>>,   // TUpdate
            searchOptionsSchema,                // TSearchOptions
            Filters,                            // TFilters
            InferSelectModel<Model> | null,     // TMutationResult (Alinhado com o retorno do Drizzle)
            void,
        >
{
    protected model: Model;
    public db: dbType;
    protected table: PgTable;

    constructor(model: Model, db: dbType) {
        this.model = model;
        this.db = db;
        // O cast para PgTable remove a incerteza do genérico para o método .from()
        this.table = model as PgTable;
    }

    /**
     * Aplica filtros, intervalos de data, ordenação e paginação.
     */
    protected applyQueryOptions<Q extends DrizzleQuery>({
        query,
        searchOptions,
        filters,
    }: ApplyQueryOptionsArgs<Q>): Q {
        const conditions: SQL<unknown>[] = [];
        const columns = getTableColumns(this.model);

        // Filtros Dinâmicos baseados nas colunas da tabela
        if (filters && Object.keys(filters).length > 0) {
            for (const [key, value] of Object.entries(filters)) {
                const column = columns[key];
                if (column && value !== undefined && value !== null) {
                    conditions.push(eq(column as PgColumn, value));
                }
            }
        }

        // Filtros de Data (SearchOptions)
        if (searchOptions) {
            const createdBefore = searchOptions.created_before ? new Date(searchOptions.created_before) : undefined;
            const createdOnOrBefore = searchOptions.created_on_or_before ? new Date(searchOptions.created_on_or_before) : undefined;
            const createdAfter = searchOptions.created_after ? new Date(searchOptions.created_after) : undefined;
            const createdOnOrAfter = searchOptions.created_on_or_after ? new Date(searchOptions.created_on_or_after) : undefined;

            const createdAtColumn = columns["created_at"];
            if (createdAtColumn) {
                if (createdBefore) conditions.push(lt(createdAtColumn, createdBefore));
                if (createdOnOrBefore) conditions.push(lte(createdAtColumn, createdOnOrBefore));
                if (createdAfter) conditions.push(gt(createdAtColumn, createdAfter));
                if (createdOnOrAfter) conditions.push(gte(createdAtColumn, createdOnOrAfter));
            }
        }

        let nextQuery: unknown = query;

        if (conditions.length > 0) {
            nextQuery = (nextQuery as DrizzleQuery).where(and(...conditions));
        }

        // Paginação e Ordenação (Apenas para Selects)
        if (searchOptions) {
            let sq = nextQuery as AnyPgSelect;

            const ordering = searchOptions.ordering || "-created_at";
            const columnName = ordering.startsWith("-") ? ordering.slice(1) : ordering;
            const direction = ordering.startsWith("-") ? "desc" : "asc";

            const orderColumn = columns[columnName];
            if (orderColumn) {
                sq = sq.orderBy(direction === "desc" ? desc(orderColumn) : asc(orderColumn)) as AnyPgSelect;
            }

            const pageSize = searchOptions.page_size;
            if (pageSize !== "all") {
                const offset = (searchOptions.page - 1) * pageSize;
                sq = (sq.limit(pageSize) as AnyPgSelect).offset(offset) as AnyPgSelect;
            }

            nextQuery = sq;
        }

        return nextQuery as Q;
    }

    async getAll(searchOptions: searchOptionsSchema, filters?: Filters): Promise<InferSelectModel<Model>[]> {
        const query = this.applyQueryOptions({
            query: this.db.select().from(this.table),
            searchOptions,
            filters,
        });
        return (await query) as InferSelectModel<Model>[];
    }

    async getById(id: string, filters?: Filters): Promise<InferSelectModel<Model> | null> {
        const query = this.applyQueryOptions({
            query: this.db.select().from(this.table),
            filters: { id, ...filters },
        });
        const result = await (query as AnyPgSelect).limit(1);
        return (result[0] ?? null) as InferSelectModel<Model> | null;
    }

    async create(data: InferInsertModel<Model>): Promise<InferSelectModel<Model>> {
        const result = await this.db.insert(this.model).values(data).returning();
        return result[0] as InferSelectModel<Model>;
    }

    async update(
        id: string,
        data: Partial<InferInsertModel<Model>>,
        filters?: Filters,
    ): Promise<InferSelectModel<Model> | null> {
        const query = this.applyQueryOptions({
            query: this.db.update(this.model).set(data),
            filters: { id, ...filters },
        });
        // Adicionando .returning() para que o update também retorne o objeto atualizado
        const result = await query.returning(); 
        return (result[0] ?? null) as InferSelectModel<Model> | null;
    }

    async delete(id: string, filters?: Filters): Promise<void> {
        const query = this.applyQueryOptions({
            query: this.db.delete(this.model),
            filters: { id, ...filters },
        });
        await query;
    }

    async count(filters?: Filters): Promise<number> {
        const query = this.applyQueryOptions({
            query: this.db.select({ count: sql<number>`count(*)` }).from(this.table),
            filters,
        });
        const result = await (query as any);
        return Number(result[0]?.count ?? 0);
    }

    async query<T = Record<string, FilterValue>>(_queryString: string): Promise<T[]> {
        throw new Error("Raw query is not supported. Use typed repository methods instead.");
    }
}
