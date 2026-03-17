import type { z } from "zod";
import type { searchOptionsSchema } from "../schemas/baseSchemas";

type SearchOptions = z.infer<typeof searchOptionsSchema>;
type FilterValue = string | number | boolean | Date | null;
export type Filters = Record<string, FilterValue>;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export interface IRepository<
	TData = object,
	TCreate = Partial<TData>,
	TUpdate = Partial<TCreate>,
	TSearchOptions extends SearchOptions = SearchOptions,
	TFilters extends Filters = Filters,
	TMutationResult = TData | null,
	TDeleteResult = object,
> {
	getAll(searchOptions: TSearchOptions, filters?: TFilters): Promise<TData[]>;

	getById(id: string, filters?: TFilters): Promise<TData | null>;

	create(data: TCreate): Promise<TMutationResult>;

	update?(
		id: string,
		data: TUpdate,
		filters?: TFilters,
	): Promise<TMutationResult>;

	delete(id: string, filters?: TFilters): Promise<TDeleteResult>;

	count?(filters?: TFilters): Promise<number>;

	query<T = JsonObject>(queryString: string): Promise<T[]>;
}
