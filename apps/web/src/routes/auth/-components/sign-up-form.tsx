import { revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { AlertCircle, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import { authClient } from "@/web/lib/auth-client";
import { SIGN_IN_FORM } from "@/web/lib/constants";
import { signUpSchema } from "@/web/lib/validators";

interface SignUpFormProps {
	redirectPath: string;
}

export function SignUpForm({ redirectPath }: SignUpFormProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);

	const signUpMutation = useMutation({
		mutationFn: async ({ email, password }: z.infer<typeof signUpSchema>) => {
			const result = await authClient.signUp.email({
				email,
				password,
				name: email.split("@")[0],
			});

			if (result.error) {
				throw result.error;
			}

			return result.data;
		},
		onSuccess: async () => {
			toast.success("First account created successfully");
			await router.invalidate();
			await navigate({
				to: redirectPath,
				replace: true,
			});
		},
		onError: (error: { message?: string }) => {
			toast.error(error.message || "Failed to create account");
		},
	});

	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
			confirmPassword: "",
		},
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: signUpSchema,
		},
		onSubmit: async ({ value }) => {
			signUpMutation.mutate(value);
		},
	});

	return (
		<div className="w-full max-w-md">
			<h1 className="mb-1 text-center font-bold text-3xl">
				Create your <span className="text-primary">LogBit</span> account
			</h1>
			<p className="mb-8 text-center text-muted-foreground">
				This workspace has not been initialized yet.
			</p>

			<form.AppForm>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
					className="space-y-5"
				>
					<div className="space-y-4 rounded-lg border border-border bg-card p-5">
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
												disabled={signUpMutation.isPending}
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
												disabled={signUpMutation.isPending}
												placeholder="••••••••"
												className="pr-9 pl-9"
											/>
											<button
												type="button"
												onClick={() => setShowPassword((value) => !value)}
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

						<form.AppField name="confirmPassword">
							{(field) => (
								<field.FormItem>
									<field.FormLabel>Confirm Password</field.FormLabel>
									<field.FormControl>
										<div className="relative">
											<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												type={showConfirmPassword ? "text" : "password"}
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												disabled={signUpMutation.isPending}
												placeholder="••••••••"
												className="pr-9 pl-9"
											/>
											<button
												type="button"
												onClick={() =>
													setShowConfirmPassword((value) => !value)
												}
												className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
												tabIndex={-1}
											>
												{showConfirmPassword ? (
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
										signUpMutation.isPending
									}
								>
									{signUpMutation.isPending
										? SIGN_IN_FORM.LOADING_MESSAGES.SIGNING_IN
										: "Create First Account"}
								</Button>
							)}
						</form.Subscribe>
					</div>

					<Alert className="rounded-lg border-primary/30 bg-primary/5 text-primary">
						<AlertCircle />
						<AlertTitle>Initial setup</AlertTitle>
						<AlertDescription>
							This screen is only available until the first user is created.
						</AlertDescription>
					</Alert>
				</form>
			</form.AppForm>
		</div>
	);
}
