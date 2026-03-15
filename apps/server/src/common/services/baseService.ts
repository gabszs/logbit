import type { z } from "zod";
import type { IRepository } from "../repository/IRepository";
import type { searchOptionsSchema } from "../schemas/baseSchemas";

type SearchOptions = z.infer<typeof searchOptionsSchema>;
export type Filters = Record<string, unknown>;

export abstract class BaseService<TData = unknown> {
	protected repository: IRepository<TData>;

	constructor(repository: IRepository<TData>) {
		this.repository = repository;
	}

	async getAll(searchOptions: SearchOptions, filters: Filters = {}) {
		return await this.repository.getAll(searchOptions, filters);
	}

	async getById(id: string, filters: Filters = {}) {
		return await this.repository.getById(id, filters);
	}

	async create(data: unknown) {
		return await this.repository.create(data);
	}

	async update(id: string, data: unknown, filters: Filters = {}) {
		return await this.repository.update?.(id, data, filters);
	}

	async delete(id: string, filters: Filters = {}) {
		return await this.repository.delete(id, filters);
	}

	async count(filters: Filters = {}): Promise<number> {
		return (await this.repository.count?.(filters)) ?? 0;
	}
}
