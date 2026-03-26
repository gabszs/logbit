import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import { ExternalLink } from "lucide-react";

export function SignInShellSkeleton() {
	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
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
									<Input type="email" placeholder="you@example.com" />
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
									<Input type="password" placeholder="••••••••" />
								</field.FormControl>
								<field.FormMessage />
							</field.FormItem>
						)}
					</form.AppField>

					<form.Subscribe>
						{() => (
							<Button type="submit" className="w-full text-base">
								Sign In
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
