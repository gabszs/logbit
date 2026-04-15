import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import { Label } from "@/web/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { authClient } from "@/web/lib/auth-client";
import {
	ADMIN_ROLE_OPTIONS,
	type AdminCreateUserForm,
	type AdminRole,
} from "./types";

type CreateUserDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => Promise<void> | void;
};

const INITIAL_VALUES: AdminCreateUserForm = {
	email: "",
	name: "",
	password: "",
	role: "user",
};

function isAdminRole(value: string): value is AdminRole {
	return ADMIN_ROLE_OPTIONS.some((role) => role === value);
}

export function CreateUserDialog({
	open,
	onOpenChange,
	onSuccess,
}: CreateUserDialogProps) {
	const [formValues, setFormValues] = useState(INITIAL_VALUES);
	const [formError, setFormError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	useEffect(() => {
		if (!open) {
			setFormValues(INITIAL_VALUES);
			setFormError(null);
			setIsPending(false);
		}
	}, [open]);

	const handleFieldChange = (
		field: keyof AdminCreateUserForm,
		value: string,
	) => {
		setFormError(null);

		if (field === "role") {
			if (!isAdminRole(value)) {
				return;
			}

			setFormValues((current) => ({ ...current, role: value }));
			return;
		}

		setFormValues((current) => ({ ...current, [field]: value }));
	};

	const handleSubmit = async () => {
		const email = formValues.email.trim();
		const name = formValues.name.trim();
		const password = formValues.password;
		const role = formValues.role;

		if (!email || !name || !password) {
			setFormError("Email, name, and password are required");
			return;
		}

		setIsPending(true);

		try {
			const { error } = await authClient.admin.createUser({
				email,
				name,
				password,
				role,
			});

			if (error) {
				throw new Error(error.message || "Failed to create user");
			}

			toast.success("User created successfully");
			await onSuccess();
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create user";
			setFormError(message);
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Create user</DialogTitle>
					<DialogDescription>
						Provision a new account directly from the Better Auth admin plugin.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="admin-create-name">Name</Label>
						<Input
							id="admin-create-name"
							value={formValues.name}
							onChange={(event) => handleFieldChange("name", event.target.value)}
							placeholder="Ada Lovelace"
							disabled={isPending}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="admin-create-email">Email</Label>
						<Input
							id="admin-create-email"
							type="email"
							value={formValues.email}
							onChange={(event) => handleFieldChange("email", event.target.value)}
							placeholder="ada@example.com"
							disabled={isPending}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="admin-create-password">Password</Label>
						<Input
							id="admin-create-password"
							type="password"
							value={formValues.password}
							onChange={(event) =>
								handleFieldChange("password", event.target.value)
							}
							placeholder="••••••••"
							disabled={isPending}
						/>
					</div>

					<div className="grid gap-2">
						<Label>Role</Label>
						<Select
							value={formValues.role}
							onValueChange={(value) => handleFieldChange("role", value)}
							disabled={isPending}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								{ADMIN_ROLE_OPTIONS.map((role) => (
									<SelectItem key={role} value={role}>
										{role}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{formError ? (
						<Alert variant="destructive">
							<AlertTitle>Unable to create user</AlertTitle>
							<AlertDescription>{formError}</AlertDescription>
						</Alert>
					) : null}
				</div>

				<DialogFooter className="gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button type="button" onClick={() => void handleSubmit()} disabled={isPending}>
						{isPending ? <Loader2 className="size-4 animate-spin" /> : null}
						Create user
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
