import { useAuth } from "@/web/components/auth-provider";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import { authClient } from "@/web/lib/auth-client";
import { SIGN_IN_FORM } from "@/web/lib/constants";
import { signInSchema } from "@/web/lib/validators";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface SignInFormProps {
	redirectPath: string;
}

export function SignInForm({ redirectPath }: SignInFormProps) {
	const navigate = useNavigate();
	const auth = useAuth();

	useEffect(() => {
		if (auth.isAuthenticated) {
			navigate({
				to: redirectPath,
				replace: true,
			});
		}
	}, [auth.isAuthenticated, navigate, redirectPath]);

	const signInMutation = useMutation({
		mutationFn: async ({ email, password }: typeof signInSchema._type) => {
			return authClient.signIn.email({
				email,
				password,
			});
		},
		onSuccess: () => {
			toast.success(SIGN_IN_FORM.SUCCESS_MESSAGES.SIGN_IN_SUCCESS);
			navigate({
				to: redirectPath,
				replace: true,
			});
		},
		onError: (error: { error?: { message?: string } }) => {
			toast.error(error.error?.message || "Failed to sign in");
		},
	});

	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validators: {
			onChange: signInSchema,
		},
		onSubmit: async ({ value }) => {
			signInMutation.mutate(value);
		},
	});

	const [showPassword, setShowPassword] = useState(false);

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
					<div className="rounded-lg border border-border bg-card p-5 space-y-4">
						<form.AppField name="email">
							{(field) => (
								<field.FormItem>
									<field.FormLabel>Email</field.FormLabel>
									<field.FormControl>
										<div className="relative">
											<Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
											<Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												type={showPassword ? "text" : "password"}
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												disabled={signInMutation.isPending}
												placeholder="••••••••"
												className="pl-9 pr-9"
											/>
											<button
												type="button"
												onClick={() => setShowPassword((v) => !v)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
