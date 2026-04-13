import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/web/components/ui/textarea";
import { authClient } from "@/web/lib/auth-client";
import type {
	OrganizationAuthClient,
	OrganizationFormValues,
	OrganizationListItem,
} from "./types";

const organizationAuthClient = authClient as typeof authClient &
	OrganizationAuthClient;

function slugify(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function getMetadataText(metadata: unknown) {
	if (!metadata || typeof metadata !== "object") {
		return "";
	}

	return JSON.stringify(metadata, null, 2);
}

function parseMetadata(
	value: string,
	mode: "create" | "edit",
	metadataKnown: boolean,
) {
	if (!value.trim()) {
		if (mode === "edit" && metadataKnown) {
			return {};
		}

		return undefined;
	}

	const parsed = JSON.parse(value) as unknown;

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Metadata must be a valid JSON object");
	}

	return parsed as Record<string, unknown>;
}

type OrganizationFormDialogProps = {
	mode: "create" | "edit";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => Promise<void> | void;
	organization?: OrganizationListItem;
};

export function OrganizationFormDialog({
	mode,
	open,
	onOpenChange,
	onSuccess,
	organization,
}: OrganizationFormDialogProps) {
	const [formValues, setFormValues] = useState<OrganizationFormValues>({
		name: "",
		slug: "",
		logo: "",
		metadata: "",
	});
	const [isPending, setIsPending] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [slugTouched, setSlugTouched] = useState(mode === "edit");

	const normalizedInitialSlug = organization?.slug.trim().toLowerCase() ?? "";
	const deferredSlug = useDeferredValue(formValues.slug.trim().toLowerCase());
	const shouldCheckSlug =
		open &&
		Boolean(deferredSlug) &&
		(mode === "create" || deferredSlug !== normalizedInitialSlug);

	const slugQuery = useQuery({
		queryKey: [
			"organization",
			"check-slug",
			mode,
			deferredSlug,
			organization?.id ?? "new",
		],
		enabled: shouldCheckSlug,
		retry: false,
		queryFn: async () => {
			const { data, error } =
				await organizationAuthClient.organization.checkSlug({
					slug: deferredSlug,
				});

			if (error) {
				throw new Error(error.message || "Failed to validate slug");
			}

			return data?.status ?? false;
		},
	});

	useEffect(() => {
		if (!open) {
			setFormError(null);
			setIsPending(false);
			return;
		}

		setFormValues({
			name: organization?.name ?? "",
			slug: organization?.slug ?? "",
			logo: organization?.logo ?? "",
			metadata: getMetadataText(organization?.metadata),
		});
		setSlugTouched(mode === "edit");
		setFormError(null);
	}, [mode, open, organization]);

	const handleFieldChange = (
		field: keyof OrganizationFormValues,
		value: string,
	) => {
		setFormError(null);
		setFormValues((current) => ({ ...current, [field]: value }));

		if (field === "name" && mode === "create" && !slugTouched) {
			setFormValues((current) => ({
				...current,
				name: value,
				slug: slugify(value),
			}));
		}

		if (field === "slug") {
			setSlugTouched(true);
		}
	};

	const handleSubmit = async () => {
		const name = formValues.name.trim();
		const slug = slugify(formValues.slug);

		if (!name) {
			setFormError("Organization name is required");
			return;
		}

		if (!slug) {
			setFormError("Organization slug is required");
			return;
		}

		if (slugQuery.isFetching) {
			setFormError("Wait for slug validation to finish");
			return;
		}

		if (shouldCheckSlug && slugQuery.data === false) {
			setFormError("This slug is already in use");
			return;
		}

		let metadata: Record<string, unknown> | undefined;

		try {
			metadata = parseMetadata(
				formValues.metadata,
				mode,
				organization ? "metadata" in organization : false,
			);
		} catch (error) {
			setFormError(
				error instanceof Error ? error.message : "Invalid metadata JSON",
			);
			return;
		}

		setIsPending(true);

		try {
			if (mode === "create") {
				const { error } = await organizationAuthClient.organization.create({
					name,
					slug,
					logo: formValues.logo.trim() || undefined,
					metadata,
					keepCurrentActiveOrganization: true,
				});

				if (error) {
					throw new Error(error.message || "Failed to create organization");
				}

				toast.success("Organization created successfully");
			} else {
				if (!organization?.id) {
					throw new Error("Missing organization id");
				}

				const { error } = await organizationAuthClient.organization.update({
					organizationId: organization.id,
					data: {
						name,
						slug,
						logo: formValues.logo.trim() || undefined,
						metadata,
					},
				});

				if (error) {
					throw new Error(error.message || "Failed to update organization");
				}

				toast.success("Organization updated successfully");
			}

			await onSuccess();
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save organization";
			setFormError(message);
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	};

	const slugStatusMessage =
		!shouldCheckSlug || !deferredSlug
			? "Use a lowercase URL-friendly slug."
			: slugQuery.isFetching
				? "Checking slug availability..."
				: slugQuery.data === true
					? "Slug is available."
					: slugQuery.data === false
						? "Slug is already in use."
						: "Use a lowercase URL-friendly slug.";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Create organization" : "Edit organization"}
					</DialogTitle>
					<DialogDescription>
						Manage the organization identity and metadata used across the
						workspace.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor={`${mode}-organization-name`}>Name</Label>
						<Input
							id={`${mode}-organization-name`}
							value={formValues.name}
							onChange={(event) =>
								handleFieldChange("name", event.target.value)
							}
							disabled={isPending}
							placeholder="Acme Inc."
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor={`${mode}-organization-slug`}>Slug</Label>
						<Input
							id={`${mode}-organization-slug`}
							value={formValues.slug}
							onChange={(event) =>
								handleFieldChange("slug", event.target.value)
							}
							disabled={isPending}
							placeholder="acme-inc"
						/>
						<p className="text-muted-foreground text-xs">{slugStatusMessage}</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor={`${mode}-organization-logo`}>Logo URL</Label>
						<Input
							id={`${mode}-organization-logo`}
							value={formValues.logo}
							onChange={(event) =>
								handleFieldChange("logo", event.target.value)
							}
							disabled={isPending}
							placeholder="https://example.com/logo.png"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor={`${mode}-organization-metadata`}>
							Metadata JSON
						</Label>
						<Textarea
							id={`${mode}-organization-metadata`}
							value={formValues.metadata}
							onChange={(event) =>
								handleFieldChange("metadata", event.target.value)
							}
							disabled={isPending}
							placeholder={'{\n  "plan": "enterprise"\n}'}
							className="min-h-40 font-mono text-sm"
						/>
						<p className="text-muted-foreground text-xs">
							Metadata must be a valid JSON object.
						</p>
					</div>

					{formError ? (
						<p className="text-destructive text-sm">{formError}</p>
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
					<Button type="button" onClick={handleSubmit} disabled={isPending}>
						{isPending ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Saving...
							</>
						) : mode === "create" ? (
							"Create organization"
						) : (
							"Save changes"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
