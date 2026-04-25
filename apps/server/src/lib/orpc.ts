import { ORPCError, os } from "@orpc/server";
import type { Context as HonoContext } from "hono";
import { db, type dbType } from "../db";
import { type AuthType, auth } from "./auth";

export type CreateOrpcOptions = {
	db: dbType;
	auth: AuthType;
};

export type CreateContextOptions = {
	context: HonoContext;
};

export type OrpcContext = {
	session: Awaited<ReturnType<AuthType["api"]["getSession"]>>;
	db: dbType;
	auth: AuthType;
	headers: Headers;
};

export const createOrpc = ({ db, auth }: CreateOrpcOptions) => {
	async function createContext({ context }: CreateContextOptions) {
		try {
			const session = await auth.api.getSession({
				headers: context.req.raw.headers,
			});

			return {
				session,
				db,
				auth,
				headers: context.req.raw.headers,
			};
		} catch (error) {
			console.error("Error creating context:", error);
			throw error;
		}
	}

	const publicProcedure = os.$context<OrpcContext>();
	const protectedProcedure = publicProcedure.use(({ context, next }) => {
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
			},
		});
	});

	return {
		createContext,
		publicProcedure,
		protectedProcedure,
	};
};

export type OrpcTools = ReturnType<typeof createOrpc>;

const defaultOrpc = createOrpc({ db, auth });

export const createContext = defaultOrpc.createContext;
export const publicProcedure = defaultOrpc.publicProcedure;
export const protectedProcedure = defaultOrpc.protectedProcedure;

export type Context = Awaited<ReturnType<typeof createContext>>;
export type ProtectedContext = Context & {
	session: NonNullable<Context["session"]>;
};
