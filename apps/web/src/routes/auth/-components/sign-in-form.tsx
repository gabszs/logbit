import { useAuth } from "@/web/components/auth-provider";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import { authClient } from "@/web/lib/auth-client";
import { SIGN_IN_FORM } from "@/web/lib/constants";
import { signInSchema } from "@/web/lib/validators";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
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

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-2 text-center font-bold text-3xl">Welcome 👋</h1>
			<p className="mb-6 text-center text-muted-foreground">
				Enter your credentials to sign in.
			</p>

			<form.AppForm>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.AppField name="email">
						{(field) => (
							<field.FormItem>
								<field.FormLabel>Email</field.FormLabel>
								<field.FormControl>
									<Input
										type="email"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={signInMutation.isPending}
										placeholder="you@example.com"
									/>
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
									<Input
										type="password"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={signInMutation.isPending}
										placeholder="••••••••"
									/>
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
									: "Sign In"}
							</Button>
						)}
					</form.Subscribe>
				</form>
			</form.AppForm>

			<div className="mt-8 text-center text-muted-foreground text-sm italic">
				Authentication powered by{" "}
				<a
					href="https://better-auth.com"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-muted-foreground underline hover:text-muted-foreground/80"
				>
					Better Auth
					<ExternalLink className="h-3 w-3" />
				</a>
				<br />
				and Cloudflare D1+KV
			</div>
		</div>
	);
}
