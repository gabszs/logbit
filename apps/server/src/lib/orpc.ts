import { ORPCError, os } from "@orpc/server";
import type { Context as HonoContext } from "hono";
import { db } from "../db";
import { auth } from "./auth";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});

	return {
		session,
		db,
		auth,
		headers: context.req.raw.headers,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const o = os.$context<Context>();

export const publicProcedure = o;

type ProtectedContext = Context & {
	session: NonNullable<Context["session"]>;
};

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
	if (!context.session) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "authorization required",
			cause: "No session",
		});
	}
	return next({
		context: {
			...context,
			session: context.session,
		} as ProtectedContext,
	});
});

export type { ProtectedContext };
