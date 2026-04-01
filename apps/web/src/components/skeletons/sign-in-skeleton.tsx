import { Lock, Mail } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";

export function SignInShellSkeleton() {
	return (
		<div className="flex min-h-svh items-start justify-center px-4 pt-[20vh]">
			<div className="w-full max-w-md">
				<h1 className="mb-1 text-center font-bold text-3xl">
					Login to <span className="text-primary">LogBit</span>
				</h1>
				<p className="mb-8 text-center text-muted-foreground">Welcome back!</p>
				<div className="space-y-4 rounded-lg border border-border bg-card p-5">
					<div className="space-y-2">
						<label className="font-medium text-sm">Email</label>
						<div className="relative">
							<Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="email"
								placeholder="you@example.com"
								disabled
								className="pl-9"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<label className="font-medium text-sm">Password</label>
						<div className="relative">
							<Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="password"
								placeholder="••••••••"
								disabled
								className="pl-9"
							/>
						</div>
					</div>
					<Button type="button" className="w-full text-base" disabled>
						Login
					</Button>
				</div>
			</div>
		</div>
	);
}
