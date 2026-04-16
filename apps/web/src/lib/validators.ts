import { z } from "zod";

export const signInSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUpSchema = signInSchema
	.extend({
		name: z.string().trim().min(2, "Please enter your name"),
		confirmPassword: z.string().min(1, "Please confirm your password"),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export const signInEmailSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
});

export const signInOtpSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	otp: z
		.string()
		.min(6, "Verification code must be 6 digits")
		.max(6, "Verification code must be 6 digits"),
});

export const twoFactorEnableSchema = z.object({
	password: z.string().min(8, "Password must be at least 8 characters"),
});

export const twoFactorDisableSchema = z.object({
	password: z.string().min(8, "Password must be at least 8 characters"),
});

export const twoFactorVerifySchema = z.object({
	code: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export const twoFactorBackupConfirmSchema = z.object({
	backupCodesSaved: z.boolean().refine((value) => value, {
		message: "Please confirm that you saved your backup codes",
	}),
});
