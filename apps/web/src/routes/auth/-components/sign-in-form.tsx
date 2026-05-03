import { revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import { authClient } from "@/web/lib/auth-client";
import { SIGN_IN_FORM } from "@/web/lib/constants";
import { signInSchema } from "@/web/lib/validators";
import { FALLBACK_REDIRECT } from "../-utils/redirect";

interface SignInFormProps {
	redirectPath: string;
}

const shouldStartTwoFactorFlow = (value: unknown): boolean => {
	if (typeof value !== "object" || value === null) return false;
	if (!("twoFactorRedirect" in value)) return false;
	return Reflect.get(value, "twoFactorRedirect") === true;
};

export function SignInForm({ redirectPath }: SignInFormProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const [showPassword, setShowPassword] = useState(false);

	const signInMutation = useMutation({
		mutationFn: async ({ email, password }: z.infer<typeof signInSchema>) => {
			const result = await authClient.signIn.email({
				email,
				password,
			});
			if (result.error) {
				throw result.error;
			}
			return {
				data: result.data,
				username: email,
			};
		},
		onSuccess: async ({ data, username }) => {
			if (shouldStartTwoFactorFlow(data)) {
				await navigate({
					to: "/auth/two-factor",
					replace: true,
					search: {
						...(redirectPath !== FALLBACK_REDIRECT
							? { redirect: redirectPath }
							: {}),
						username,
					},
				});
				return;
			}

			toast.success(SIGN_IN_FORM.SUCCESS_MESSAGES.SIGN_IN_SUCCESS);
			await router.invalidate();
			await navigate({
				to: redirectPath,
				replace: true,
			});
		},
		onError: (error: { message?: string }) => {
			toast.error(error.message || "Failed to sign in");
		},
	});

	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: signInSchema,
		},
		onSubmit: async ({ value }) => {
			signInMutation.mutate(value);
		},
	});

	return (
		<div className="w-full max-w-md">
			<h1 className="mb-1 text-center font-bold text-3xl">
				Login to <span className="text-primary">LogBit</span>
			</h1>
			<p className="mb-8 text-center text-muted-foreground">Welcome back!</p>

			<form.AppForm>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
					className="space-y-5"
				>
					<div className="app-surface space-y-4 p-5">
						<form.AppField name="email">
							{(field) => (
								<field.FormItem>
									<field.FormLabel>Email</field.FormLabel>
									<field.FormControl>
										<div className="relative">
											<Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												type="email"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												disabled={signInMutation.isPending}
												placeholder="you@example.com"
												className="pl-9"
											/>
										</div>
									</field.FormControl>
									<field.FormMessage />
								</field.FormItem>
							)}
						</form.AppField>

						<form.AppField name="password">
							{(field) => (
								<field.FormItem>
									<field.FormLabel>Password</field.FormLabel>
									<field.FormControl>
										<div className="relative">
											<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												type={showPassword ? "text" : "password"}
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												disabled={signInMutation.isPending}
												placeholder="••••••••"
												className="pr-9 pl-9"
											/>
											<button
												type="button"
												onClick={() => setShowPassword((v) => !v)}
												className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
												tabIndex={-1}
											>
												{showPassword ? (
													<EyeOff className="size-4" />
												) : (
													<Eye className="size-4" />
												)}
											</button>
										</div>
									</field.FormControl>
									<field.FormMessage />
								</field.FormItem>
							)}
						</form.AppField>

						<form.Subscribe>
							{(state) => (
								<Button
									type="submit"
									className="w-full text-base"
									disabled={
										!state.canSubmit ||
										state.isSubmitting ||
										signInMutation.isPending
									}
								>
									{signInMutation.isPending
										? SIGN_IN_FORM.LOADING_MESSAGES.SIGNING_IN
										: "Login"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</form.AppForm>
		</div>
	);
}
