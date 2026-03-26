import { z } from "zod";

export const signInSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
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
