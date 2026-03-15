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
import { type DrizzleD1Database } from "drizzle-orm/d1";
import { type SQLiteTable } from "drizzle-orm/sqlite-core";
import { type z } from "zod";
import { type searchOptionsSchema } from "../schemas/baseSchemas";
import { type IRepository } from "./IRepository";

type FilterValue = string | number | boolean | Date | null;
type Filters = Record<string, FilterValue>;

interface SearchOptionsWithFilters extends z.infer<typeof searchOptionsSchema> {
	createdBefore?: Date;
	createdOnOrBefore?: Date;
	createdAfter?: Date;
	createdOnOrAfter?: Date;
}

export class BaseSqlRepository<Model extends SQLiteTable>
	implements IRepository<InferInsertModel<Model>>
{
	protected model: Model;
	public db: DrizzleD1Database;

	constructor(model: Model, db: DrizzleD1Database) {
		this.model = model;
		this.db = db;
	}

	protected applyFilters(filters?: Filters): SQL<unknown> | undefined {
		if (!filters || Object.keys(filters).length === 0) {
			return undefined;
		}

		const conditions: SQL<unknown>[] = [];

		for (const [key, value] of Object.entries(filters)) {
			if (key in this.model && value !== undefined && value !== null) {
				conditions.push(eq(this.model[key as keyof Model], value));
			}
		}

		return conditions.length > 0 ? and(...conditions) : undefined;
	}

	protected applySearchOptions(query: any, searchOptions: SearchOptionsWithFilters) {
		const ordering = searchOptions.ordering || "createdAt";
		const column = ordering.startsWith("-") ? ordering.slice(1) : ordering;
		const direction = ordering.startsWith("-") ? "desc" : "asc";

		if (column in this.model) {
			query = query.orderBy(
				direction === "desc"
					? desc(this.model[column as keyof Model])
					: asc(this.model[column as keyof Model]),
			);
		}
		const dateConditions: SQL<unknown>[] = [];
		const createdAtColumn = this.model.createdAt;

		if (createdAtColumn) {
			if (searchOptions.createdBefore) {
				dateConditions.push(lt(createdAtColumn, searchOptions.createdBefore));
			}
			if (searchOptions.createdOnOrBefore) {
				dateConditions.push(lte(createdAtColumn, searchOptions.createdOnOrBefore));
			}
			if (searchOptions.createdAfter) {
				dateConditions.push(gt(createdAtColumn, searchOptions.createdAfter));
			}
			if (searchOptions.createdOnOrAfter) {
				dateConditions.push(gte(createdAtColumn, searchOptions.createdOnOrAfter));
			}

			if (dateConditions.length > 0) {
				query = query.where(and(...dateConditions) as any);
			}
		}
		if (searchOptions.pageSize !== "all") {
			const offset = (searchOptions.page - 1) * searchOptions.pageSize;
			query = query.limit(searchOptions.pageSize).offset(offset);
		}

		return query;
	}

	async getAll(searchOptions: SearchOptionsWithFilters, filters?: Filters) {
		let query = this.db.select().from(this.model);
		const filterConditions = this.applyFilters(filters);
		if (filterConditions) {
			query = query.where(filterConditions as any);
		}
		query = this.applySearchOptions(query, searchOptions);

		return await query.all();
	}

	async getById(id: string, filters?: Filters) {
		let query = this.db.select().from(this.model).where(eq(this.model.id, id));

		const filterConditions = this.applyFilters(filters);
		if (filterConditions) {
			query = query.where(and(eq(this.model.id, id), filterConditions) as any);
		}

		const result = await query.limit(1);
		return result[0] ?? null;
	}

	async create(schema: InferInsertModel<Model>) {
		const result = await this.db.insert(this.model).values(schema).returning();
		return result[0];
	}

	async update(id: string, schema: Partial<InferInsertModel<Model>>, filters?: Filters) {
		let query = this.db.update(this.model).set(schema).where(eq(this.model.id, id));

		const filterConditions = this.applyFilters(filters);
		if (filterConditions) {
			query = query.where(and(eq(this.model.id, id), filterConditions) as any);
		}

		return await query;
	}

	async delete(id: string, filters?: Filters) {
		let query = this.db.delete(this.model).where(eq(this.model.id, id));

		const filterConditions = this.applyFilters(filters);
		if (filterConditions) {
			query = query.where(and(eq(this.model.id, id), filterConditions) as any);
		}

		return await query;
	}

	async count(filters?: Filters): Promise<number> {
		let query = this.db.select({ count: sql<number>`count(*)` }).from(this.model);

		const filterConditions = this.applyFilters(filters);
		if (filterConditions) {
			query = query.where(filterConditions as any);
		}

		const result = await query.get();
		return result?.count ?? 0;
	}

	async query<T = unknown>(queryString: string): Promise<T[]> {
		const result = await this.db.execute(sql.raw(queryString));
		return result.results as T[];
	}
}
