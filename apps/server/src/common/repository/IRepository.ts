import type { ZodUUID } from "zod";
import type { searchOptionsSchemaType } from "../schemas/baseSchemas";

type FilterValue = string | number | boolean | Date | ZodUUID | null;
export type Filters = Record<string, FilterValue>;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export interface IRepository<
	TData = object,
	TCreate = Partial<TData>,
	TUpdate = Partial<TCreate>,
	TSearchOptions extends searchOptionsSchemaType = searchOptionsSchemaType,
	TFilters extends Filters = Filters,
	TMutationResult = TData | null,
	TDeleteResult = void,
> {
	getAll(searchOptions: TSearchOptions, filters?: TFilters): Promise<TData[]>;

	getById(id: string, filters?: TFilters): Promise<TData | null>;

	create(data: TCreate): Promise<TData>;

	update?(
		id: string,
		data: TUpdate,
		filters?: TFilters,
	): Promise<TMutationResult>;

	delete(id: string, filters?: TFilters): Promise<TDeleteResult>;

	count?(filters?: TFilters): Promise<number>;

	query<T = JsonObject>(queryString: string): Promise<T[]>;
}
