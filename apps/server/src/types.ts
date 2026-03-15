import { type OpenAPIHono } from "@hono/zod-openapi";

export type AppContext = OpenAPIHono<{ Bindings: Env }>;
