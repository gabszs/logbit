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

export abstract class BaseSqlRepository<Model extends PgTable>
	implements
		IRepository<
			InferSelectModel<Model>, // TData
			InferInsertModel<Model>, // TCreate
			Partial<InferInsertModel<Model>>, // TUpdate
			searchOptionsSchema, // TSearchOptions
			Filters, // TFilters
			InferSelectModel<Model> | null, // TMutationResult
			void
		>
{
	protected model: Model;
	public db: dbType;
	protected table: PgTable;

	constructor(model: Model, db: dbType) {
		this.model = model;
		this.db = db;
		this.table = model as PgTable;
	}

	/**
	 * Constrói as condições WHERE a partir de filtros e date-range.
	 * Retorna um SQL combinado ou undefined — o caller aplica .where() no seu
	 * builder concreto, preservando o tipo exato sem casts genéricos.
	 */
	protected buildWhereConditions(
		filters?: Filters | null,
		searchOptions?: searchOptionsSchema | null,
	): SQL<unknown> | undefined {
		const conditions: SQL<unknown>[] = [];
		const columns = getTableColumns(this.model);

		if (filters && Object.keys(filters).length > 0) {
			for (const [key, value] of Object.entries(filters)) {
				const column = columns[key];
				if (column && value !== undefined && value !== null) {
					conditions.push(eq(column as PgColumn, value));
				}
			}
		}

		if (searchOptions) {
			const createdAtColumn = columns["created_at"];
			if (createdAtColumn) {
				if (searchOptions.created_before)
					conditions.push(
						lt(createdAtColumn, new Date(searchOptions.created_before)),
					);
				if (searchOptions.created_on_or_before)
					conditions.push(
						lte(createdAtColumn, new Date(searchOptions.created_on_or_before)),
					);
				if (searchOptions.created_after)
					conditions.push(
						gt(createdAtColumn, new Date(searchOptions.created_after)),
					);
				if (searchOptions.created_on_or_after)
					conditions.push(
						gte(createdAtColumn, new Date(searchOptions.created_on_or_after)),
					);
			}
		}

		return conditions.length > 0 ? and(...conditions) : undefined;
	}

	/**
	 * Aplica filtros, ordenação e paginação em queries SELECT.
	 * Tipado concretamente como AnyPgSelect — sem genérico, sem casts espalhados.
	 * O único cast necessário (após .where()) é isolado aqui, documentado pelo
	 * padrão Omit do Drizzle que remove o método após o primeiro uso.
	 */
	protected applySelectOptions(
		query: AnyPgSelect,
		searchOptions?: searchOptionsSchema | null,
		filters?: Filters | null,
	): AnyPgSelect {
		const condition = this.buildWhereConditions(filters, searchOptions);
		// Cast necessário: .where() retorna Omit<PgSelectBase, "where">, não AnyPgSelect
		let result = query.where(condition) as AnyPgSelect;

		if (searchOptions) {
			const columns = getTableColumns(this.model);
			const ordering = searchOptions.ordering ?? "-created_at";
			const columnName = ordering.startsWith("-")
				? ordering.slice(1)
				: ordering;
			const direction = ordering.startsWith("-") ? "desc" : "asc";

			const orderColumn = columns[columnName];
			if (orderColumn) {
				result = result.orderBy(
					direction === "desc" ? desc(orderColumn) : asc(orderColumn),
				) as AnyPgSelect;
			}

			const { page_size: pageSize, page } = searchOptions;
			if (pageSize !== "all") {
				result = (result.limit(pageSize) as AnyPgSelect).offset(
					(page - 1) * pageSize,
				) as AnyPgSelect;
			}
		}

		return result;
	}

	async getAll(
		searchOptions: searchOptionsSchema,
		filters?: Filters,
	): Promise<InferSelectModel<Model>[]> {
		const query = this.applySelectOptions(
			this.db.select().from(this.table),
			searchOptions,
			filters,
		);
		return (await query) as InferSelectModel<Model>[];
	}

	async getById(
		id: string,
		filters?: Filters,
	): Promise<InferSelectModel<Model> | null> {
		const query = this.applySelectOptions(
			this.db.select().from(this.table),
			null,
			{ id, ...filters },
		);
		const result = await (query as AnyPgSelect).limit(1);
		return (result[0] ?? null) as InferSelectModel<Model> | null;
	}

	async create(
		data: InferInsertModel<Model>,
	): Promise<InferSelectModel<Model>> {
		const result = await this.db.insert(this.model).values(data).returning();
		return result[0] as InferSelectModel<Model>;
	}

	async update(
		id: string,
		data: Partial<InferInsertModel<Model>>,
		filters?: Filters,
	): Promise<InferSelectModel<Model> | null> {
		const condition = this.buildWhereConditions({ id, ...filters });
		const result = await this.db
			.update(this.model)
			.set(data)
			.where(condition)
			.returning();
		return (result[0] ?? null) as InferSelectModel<Model> | null;
	}

	async delete(id: string, filters?: Filters): Promise<void> {
		const condition = this.buildWhereConditions({ id, ...filters });
		await this.db.delete(this.model).where(condition);
	}

	async count(filters?: Filters): Promise<number> {
		const query = this.applySelectOptions(
			this.db.select({ count: sql<number>`count(*)` }).from(this.table),
			null,
			filters,
		);
		const result = await query;
		return Number((result[0] as { count: number })?.count ?? 0);
	}

	async query<T = Record<string, FilterValue>>(
		_queryString: string,
	): Promise<T[]> {
		throw new Error(
			"Raw query is not supported. Use typed repository methods instead.",
		);
	}
}
