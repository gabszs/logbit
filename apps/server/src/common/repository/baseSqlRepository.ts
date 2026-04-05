import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	type InferInsertModel,
	lt,
	lte,
	type SQL,
	sql,
} from "drizzle-orm";
import type {
	AnyPgSelect,
	PgColumn,
	PgTable,
	PgTableWithColumns,
} from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { dbType } from "@/db";
import type { searchOptionsSchema } from "../schemas/baseSchemas";
import type { IRepository } from "./IRepository";

type FilterValue = string | number | boolean | Date | null;
type Filters = Record<string, FilterValue>;

interface SearchOptionsWithFilters extends z.infer<typeof searchOptionsSchema> {
	createdBefore?: Date;
	createdOnOrBefore?: Date;
	createdAfter?: Date;
	createdOnOrAfter?: Date;
	pageSize?: number | "all";
}

/**
 * Minimal structural type for any Drizzle query builder that accepts a where clause.
 * Returns `unknown` so that all variants (select, update, delete — dynamic or not)
 * satisfy the constraint regardless of their individual chain-return types.
 */
type DrizzleQuery = {
	where(condition: SQL | undefined): unknown;
};

type ApplyQueryOptionsArgs<Q extends DrizzleQuery> = {
	query: Q;
	searchOptions?: SearchOptionsWithFilters | null;
	filters?: Filters | null;
};

export abstract class BaseSqlRepository<Model extends PgTable>
	implements
		IRepository<
			InferInsertModel<Model>,
			InferInsertModel<Model>,
			Partial<InferInsertModel<Model>>,
			SearchOptionsWithFilters,
			Filters,
			object,
			object
		>
{
	protected model: Model;
	public db: dbType;
	protected table: PgTable;

	constructor(model: Model, db: dbType) {
		this.model = model;
		this.db = db;
		this.table = model as PgTable; // Cast to concrete PgTable to satisfy Drizzle's type constraints
	}

	/**
	 * Applies filters, date ranges, ordering, and pagination to any Drizzle query builder.
	 * Returns the same type `Q` that was passed in so callers retain full type information.
	 * `searchOptions` must only be passed for select queries — ordering and pagination are
	 * not available on update/delete builders.
	 */
	protected applyQueryOptions<Q extends DrizzleQuery>({
		query,
		searchOptions,
		filters,
	}: ApplyQueryOptionsArgs<Q>): Q {
		const conditions: SQL<unknown>[] = [];

		if (filters && Object.keys(filters).length > 0) {
			for (const [key, value] of Object.entries(filters)) {
				if (key in this.model && value !== undefined && value !== null) {
					conditions.push(
						eq(this.model[key as keyof Model] as PgColumn, value),
					);
				}
			}
		}

		if (searchOptions) {
			const createdBefore =
				searchOptions.createdBefore ??
				(searchOptions.created_before
					? new Date(searchOptions.created_before)
					: undefined);
			const createdOnOrBefore =
				searchOptions.createdOnOrBefore ??
				(searchOptions.created_on_or_before
					? new Date(searchOptions.created_on_or_before)
					: undefined);
			const createdAfter =
				searchOptions.createdAfter ??
				(searchOptions.created_after
					? new Date(searchOptions.created_after)
					: undefined);
			const createdOnOrAfter =
				searchOptions.createdOnOrAfter ??
				(searchOptions.created_on_or_after
					? new Date(searchOptions.created_on_or_after)
					: undefined);

			const createdAtColumn =
				"created_at" in this.model
					? (this.model as unknown as { created_at: PgColumn }).created_at
					: undefined;
			if (createdAtColumn) {
				if (createdBefore) conditions.push(lt(createdAtColumn, createdBefore));
				if (createdOnOrBefore)
					conditions.push(lte(createdAtColumn, createdOnOrBefore));
				if (createdAfter) conditions.push(gt(createdAtColumn, createdAfter));
				if (createdOnOrAfter)
					conditions.push(gte(createdAtColumn, createdOnOrAfter));
			}
		}

		// `unknown` lets us freely reassign across the different chain-return types
		// produced by each Drizzle builder without fighting their Omit<> exclusion pattern.
		let nextQuery: unknown = query;

		if (conditions.length > 0) {
			nextQuery = (nextQuery as DrizzleQuery).where(
				and(...conditions) as SQL<unknown>,
			);
		}

		if (searchOptions) {
			// searchOptions is only passed for select queries — the cast to AnyPgSelect is safe.
			// Each chained call (orderBy, limit, offset) is re-cast to keep the chain going,
			// because Drizzle's non-dynamic builders return Omit<..., method> which breaks
			// reassignment. Using `as AnyPgSelect` is the explicit escape hatch.
			let sq = nextQuery as AnyPgSelect;

			const ordering = searchOptions.ordering || "-created_at";
			const column = ordering.startsWith("-") ? ordering.slice(1) : ordering;
			const direction = ordering.startsWith("-") ? "desc" : "asc";

			if (column in this.model) {
				const orderColumn = this.model[column as keyof Model] as PgColumn;
				sq = sq.orderBy(
					direction === "desc" ? desc(orderColumn) : asc(orderColumn),
				) as AnyPgSelect;
			}

			const pageSize = searchOptions.pageSize ?? searchOptions.page_size;
			if (pageSize !== "all") {
				const offset = (searchOptions.page - 1) * pageSize;
				sq = (sq.limit(pageSize) as AnyPgSelect).offset(offset) as AnyPgSelect;
			}

			nextQuery = sq;
		}

		return nextQuery as Q;
	}

	// TypeScript cannot evaluate the deferred conditional type
	// `TableLikeHasEmptySelection<Model>` for any generic Model — even with `extends PgTable`.
	// Casting to the concrete `PgTable` resolves it for the `.from()` call site.
	// private get table(): PgTable {
	// 	return this.model as PgTable;
	// }

	async getAll(searchOptions: SearchOptionsWithFilters, filters?: Filters) {
		const query = this.applyQueryOptions({
			query: this.db.select().from(this.table),
			searchOptions,
			filters,
		});
		return (await query) as InferInsertModel<Model>[];
	}

	async getById(id: string, filters?: Filters) {
		const query = this.applyQueryOptions({
			query: this.db.select().from(this.table),
			filters: { id, ...filters },
		});
		const result = await query.limit(1);
		return (result[0] ?? null) as InferInsertModel<Model> | null;
	}

	async create(schema: InferInsertModel<Model>) {
		const result = await this.db.insert(this.model).values(schema).returning();
		return result[0];
	}

	async update(
		id: string,
		schema: Partial<InferInsertModel<Model>>,
		filters?: Filters,
	) {
		const query = this.applyQueryOptions({
			query: this.db.update(this.model).set(schema),
			filters: { id, ...filters },
		});
		return await query;
	}

	async delete(id: string, filters?: Filters) {
		const query = this.applyQueryOptions({
			query: this.db.delete(this.model),
			filters: { id, ...filters },
		});
		return await query;
	}

	async count(filters?: Filters): Promise<number> {
		const query = this.applyQueryOptions({
			query: this.db.select({ count: sql<number>`count(*)` }).from(this.table),
			filters,
		});
		const result = await query;
		return result[0]?.count ?? 0;
	}

	/**
	 * Required by IRepository but intentionally not implemented.
	 * Raw SQL strings are a SQL injection risk — use typed repository methods instead.
	 */
	async query<T = Record<string, string | number | boolean | Date | null>>(
		_queryString: string,
	): Promise<T[]> {
		throw new Error(
			"Raw query is not supported. Use typed repository methods instead.",
		);
	}
}
