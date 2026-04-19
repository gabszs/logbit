import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "../../types";

const integrationsRouter = new OpenAPIHono<AppContext>();

export default integrationsRouter;
