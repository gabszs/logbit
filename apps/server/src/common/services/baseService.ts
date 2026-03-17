import type { z } from "zod";
import type { IRepository } from "../repository/IRepository";
import type { searchOptionsSchema } from "../schemas/baseSchemas";

type SearchOptions = z.infer<typeof searchOptionsSchema>;
type FilterValue = string | number | boolean | Date | null;
export type Filters = Record<string, FilterValue>;

export abstract class BaseService<
	TData = object,
	TCreate = Partial<TData>,
	TUpdate = Partial<TCreate>,
	TSearchOptions extends SearchOptions = SearchOptions,
	TFilters extends Filters = Filters,
	TMutationResult = TData | null,
	TDeleteResult = object,
> {
	protected repository: IRepository<
		TData,
		TCreate,
		TUpdate,
		TSearchOptions,
		TFilters,
		TMutationResult,
		TDeleteResult
	>;

	constructor(
		repository: IRepository<
			TData,
			TCreate,
			TUpdate,
			TSearchOptions,
			TFilters,
			TMutationResult,
			TDeleteResult
		>,
	) {
		this.repository = repository;
	}

	async getAll(
		searchOptions: TSearchOptions,
		filters: TFilters = {} as TFilters,
	) {
		return await this.repository.getAll(searchOptions, filters);
	}

	async getById(id: string, filters: TFilters = {} as TFilters) {
		return await this.repository.getById(id, filters);
	}

	async create(data: TCreate) {
		return await this.repository.create(data);
	}

	async update(id: string, data: TUpdate, filters: TFilters = {} as TFilters) {
		return await this.repository.update?.(id, data, filters);
	}

	async delete(id: string, filters: TFilters = {} as TFilters) {
		return await this.repository.delete(id, filters);
	}

	async count(filters: TFilters = {} as TFilters): Promise<number> {
		return (await this.repository.count?.(filters)) ?? 0;
	}
}
