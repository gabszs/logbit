import { type z } from "zod";
import { type searchOptionsSchema } from "../schemas/baseSchemas";

type SearchOptions = z.infer<typeof searchOptionsSchema>;
type Filters = Record<string, unknown>;

export interface IRepository<TData = unknown> {
	getAll(searchOptions: SearchOptions, filters?: Filters): Promise<TData[]>;

	getById(id: string, filters?: Filters): Promise<TData | null>;

	create(data: unknown): Promise<TData | void>;

	update?(id: string, data: unknown, filters?: Filters): Promise<unknown>;

	delete(id: string, filters?: Filters): Promise<unknown>;

	count?(filters?: Filters): Promise<number>;

	query<T = unknown>(queryString: string): Promise<T[]>;
}
