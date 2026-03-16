import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP, openAPI, phoneNumber } from "better-auth/plugins";
import { withCloudflare } from "better-auth-cloudflare";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Resend } from "resend";
import { models } from "../db/models";
import type { AppContext } from "../types";
import { EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME } from "./constants";
import {
	renderResetPasswordEmail,
	renderVerificationCodeEmail,
	renderVerificationEmail,
} from "./email";

function createAuth(c?: AppContext, cf?: IncomingRequestCfProperties) {
	const db = c?.env ? drizzle(c.env.D1, { schema: models }) : ({} as any);
	return betterAuth({
		...withCloudflare(
			{
				autoDetectIpAddress: true,
				geolocationTracking: true,
				cf: cf || {},
				d1: c?.env
					? {
							db,
							options: {
								usePlural: true,
								debugLogs: true,
							},
						}
					: undefined,
				kv: c?.env?.KV,
				r2: {
					bucket: c?.env?.R2,
					maxFileSize: 2 * 1024 * 1024,
					allowedTypes: [".jpg", ".jpeg", ".png", ".gif"],
					additionalFields: {
						category: { type: "string", required: false },
						isPublic: { type: "boolean", required: false },
						description: { type: "string", required: false },
					},
				},
			},
			{
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
					sendResetPassword: async ({ user, url }) => {
						const resend = new Resend(c?.env?.RESEND_API_KEY || "");
						const emailHtml = await renderResetPasswordEmail({
							name: user.name,
							url,
						});
						await resend.emails.send({
							from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
							to: user.email,
							subject: "Reset your password",
							html: emailHtml,
						});
					},
				},
				emailVerification: {
					sendVerificationEmail: async ({ user, url }) => {
						const resend = new Resend(c?.env?.RESEND_API_KEY || "");
						const emailHtml = await renderVerificationEmail({
							name: user.name,
							url,
						});
						await resend.emails.send({
							from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
							to: user.email,
							subject: "Your Verification Email",
							html: emailHtml,
						});
					},
					sendOnSignUp: true,
					autoSignInAfterVerification: true,
				},
				plugins: [
					openAPI(),
					admin(),
					phoneNumber(),
					// emailOTP({
					// 	async sendVerificationOTP({ email, otp, type }) {
					// 		// console.log("sendVerificationOTP", { email, otp, type });
					// 		if (type === "sign-in") {
					// 			const resend = new Resend(c?.env?.RESEND_API_KEY || "");
					// 			const emailHtml = await renderVerificationCodeEmail(otp);
					// 			await resend.emails.send({
					// 				from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
					// 				to: email,
					// 				subject: "Your Verification Code",
					// 				html: emailHtml,
					// 			});
					// 		}
					// 	},
					// }),
				],
				socialProviders: {
					google: {
						clientId: c?.env?.GOOGLE_CLIENT_ID || "",
						clientSecret: c?.env?.GOOGLE_CLIENT_SECRET || "",
					},
					github: {
						clientId: c?.env?.GITHUB_CLIENT_ID || "",
						clientSecret: c?.env?.GITHUB_CLIENT_SECRET || "",
					},
				},
			},
		),
		database: drizzleAdapter(db || ({} as D1Database), {
			provider: "sqlite",
			usePlural: true,
			debugLogs: true,
			schema: models,
		}),
		trustedOrigins: c?.env?.CORS_ORIGIN?.split(",") || [
			"http://localhost:3001",
			"http://localhost:3000",
			"http://localhost:3002",
		],
		secret: c?.env?.BETTER_AUTH_SECRET || "",
		basePath: "/api/auth",
		baseURL: c?.env?.BETTER_AUTH_URL || "http://localhost:8787/api/auth",
		telemetry: {
			enabled: false,
		},
	});
}

import "dotenv/config";
import { settings } from "node:cluster";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { db } from "../db";
import { models } from "../db/models";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: models,
	}),
	emailAndPassword: {
		enabled: true,
	},
	trustedOrigins: [settings.CLIENT_URL!],
	plugins: [openAPI()],
});

export async function authenticateSession(c: Context) {
	const auth = c.get("auth");
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	return {
		user: session.user,
		session: session.session,
	};
}

export const auth = createAuth();
export { createAuth };
