import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import { Checkbox } from "@/web/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/web/components/ui/input-otp";
import { Label } from "@/web/components/ui/label";
import { Switch } from "@/web/components/ui/switch";
import { useProfile } from "@/web/hooks/use-profile";
import { authClient } from "@/web/lib/auth-client";
import { orpc } from "@/web/lib/orpc";
import {
	twoFactorBackupConfirmSchema,
	twoFactorDisableSchema,
	twoFactorEnableSchema,
	twoFactorVerifySchema,
} from "@/web/lib/validators";
import { DetailCard } from "../detail-card";

type TwoFactorUIState =
	| "idle"
	| "enableForm"
	| "enableReady"
	| "enableConfirm"
	| "disableForm";

interface TwoFactorSetupData {
	totpURI: string;
	backupCodes: string[];
	secret: string;
}

const TOTP_CODE_LENGTH = 6;
const TOTP_SLOT_POSITIONS = [0, 1, 2, 3, 4, 5] as const;

const getErrorMessage = (error: unknown, fallback: string): string => {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "object" && error !== null) {
		const message = Reflect.get(error, "message");
		if (typeof message === "string" && message.length > 0) return message;
	}
	return fallback;
};

const normalizeBackupCodes = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
};

const extractTotpSecret = (totpURI: string): string => {
	try {
		const parsed = new URL(totpURI);
		return parsed.searchParams.get("secret") ?? "";
	} catch {
		return "";
	}
};

export function TwoFactorSettings() {
	const profile = useProfile();
	const queryClient = useQueryClient();
	const [uiState, setUIState] = useState<TwoFactorUIState>("idle");
	const [setupPassword, setSetupPassword] = useState("");
	const [disablePassword, setDisablePassword] = useState("");
	const [verificationCode, setVerificationCode] = useState("");
	const [backupCodesSaved, setBackupCodesSaved] = useState(false);
	const [setupPasswordError, setSetupPasswordError] = useState<string | null>(
		null,
	);
	const [disablePasswordError, setDisablePasswordError] = useState<
		string | null
	>(null);
	const [verificationError, setVerificationError] = useState<string | null>(
		null,
	);
	const [backupCodesError, setBackupCodesError] = useState<string | null>(null);
	const [showManualSetupKey, setShowManualSetupKey] = useState(false);
	const [isFinalizingEnable, setIsFinalizingEnable] = useState(false);
	const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);

	const isTwoFactorEnabled = Boolean(profile.data?.twoFactorEnabled);

	const enableMutation = useMutation({
		mutationFn: async ({ password }: { password: string }) => {
			const parsed = twoFactorEnableSchema.safeParse({ password });
			if (!parsed.success) {
				throw new Error(parsed.error.issues[0]?.message ?? "Invalid password");
			}

			const result = await authClient.twoFactor.enable({
				password: parsed.data.password,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Failed to start 2FA setup"),
				);
			}

			const totpURI =
				typeof result.data?.totpURI === "string" ? result.data.totpURI : "";
			const backupCodes = normalizeBackupCodes(result.data?.backupCodes);
			const secret = extractTotpSecret(totpURI);

			if (!totpURI || backupCodes.length === 0 || !secret) {
				throw new Error("Unable to load 2FA setup data");
			}

			return {
				totpURI,
				backupCodes,
				secret,
			} satisfies TwoFactorSetupData;
		},
		onSuccess: (data) => {
			setSetupData(data);
			setSetupPassword("");
			setSetupPasswordError(null);
			setVerificationCode("");
			setVerificationError(null);
			setBackupCodesSaved(false);
			setBackupCodesError(null);
			setShowManualSetupKey(false);
			setUIState("enableReady");
			toast.success("Authenticator setup started");
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to start 2FA setup"));
		},
	});

	const verifyMutation = useMutation({
		mutationFn: async ({ code }: { code: string }) => {
			const parsed = twoFactorVerifySchema.safeParse({
				code,
			});
			if (!parsed.success) {
				throw new Error(
					parsed.error.issues[0]?.message ?? "Invalid verification",
				);
			}

			const result = await authClient.twoFactor.verifyTotp({
				code: parsed.data.code,
				trustDevice: false,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Invalid authentication code"),
				);
			}
		},
		onSuccess: () => {
			setVerificationCode("");
			setVerificationError(null);
			setUIState("enableConfirm");
			toast.success("Code verified. Save your backup codes to finish setup.");
		},
		onError: (error) => {
			toast.error(
				getErrorMessage(error, "Failed to verify authentication code"),
			);
		},
	});

	const disableMutation = useMutation({
		mutationFn: async ({ password }: { password: string }) => {
			const parsed = twoFactorDisableSchema.safeParse({ password });
			if (!parsed.success) {
				throw new Error(parsed.error.issues[0]?.message ?? "Invalid password");
			}

			const result = await authClient.twoFactor.disable({
				password: parsed.data.password,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(
						result.error,
						"Failed to disable two-factor authentication",
					),
				);
			}
		},
		onSuccess: async () => {
			setUIState("idle");
			setDisablePassword("");
			setDisablePasswordError(null);
			try {
				await refreshProfileState();
				toast.success("Two-factor authentication disabled");
			} catch (error) {
				toast.error(
					getErrorMessage(
						error,
						"Two-factor was disabled, but profile refresh failed. Reload the page.",
					),
				);
			}
		},
		onError: (error) => {
			toast.error(
				getErrorMessage(error, "Failed to disable two-factor authentication"),
			);
		},
	});

	const isBusy =
		enableMutation.isPending ||
		verifyMutation.isPending ||
		disableMutation.isPending ||
		isFinalizingEnable;

	const refreshProfileState = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.profile.get.queryOptions().queryKey,
		});
		await profile.refetch();
	};

	const resetEnableFlow = () => {
		setSetupPassword("");
		setSetupPasswordError(null);
		setVerificationCode("");
		setVerificationError(null);
		setBackupCodesSaved(false);
		setBackupCodesError(null);
		setShowManualSetupKey(false);
		setSetupData(null);
	};

	const resetDisableFlow = () => {
		setDisablePassword("");
		setDisablePasswordError(null);
	};

	const handleToggleChange = (checked: boolean) => {
		if (isBusy) return;

		if (checked && !isTwoFactorEnabled) {
			resetEnableFlow();
			setUIState("enableForm");
			return;
		}

		if (!checked && isTwoFactorEnabled) {
			resetDisableFlow();
			setUIState("disableForm");
		}
	};

	const handleStartSetup = () => {
		const parsed = twoFactorEnableSchema.safeParse({
			password: setupPassword,
		});
		if (!parsed.success) {
			setSetupPasswordError(
				parsed.error.issues[0]?.message ?? "Invalid password",
			);
			return;
		}
		setSetupPasswordError(null);
		enableMutation.mutate({ password: parsed.data.password });
	};

	const handleVerifyTotp = () => {
		const parsed = twoFactorVerifySchema.safeParse({
			code: verificationCode,
		});
		if (!parsed.success) {
			setVerificationError(
				parsed.error.issues[0]?.message ?? "Invalid verification code",
			);
			return;
		}
		setVerificationError(null);
		verifyMutation.mutate({ code: parsed.data.code });
	};

	const handleFinalizeSetup = async () => {
		const parsed = twoFactorBackupConfirmSchema.safeParse({
			backupCodesSaved,
		});
		if (!parsed.success) {
			setBackupCodesError(
				parsed.error.issues[0]?.message ??
					"Please confirm that you saved your backup codes",
			);
			return;
		}
		setBackupCodesError(null);
		setIsFinalizingEnable(true);
		try {
			await refreshProfileState();
			resetEnableFlow();
			setUIState("idle");
			toast.success("Two-factor authentication enabled");
		} catch (error) {
			toast.error(
				getErrorMessage(
					error,
					"Two-factor was enabled, but profile refresh failed. Reload the page.",
				),
			);
		} finally {
			setIsFinalizingEnable(false);
		}
	};

	const handleDisable = () => {
		const parsed = twoFactorDisableSchema.safeParse({
			password: disablePassword,
		});
		if (!parsed.success) {
			setDisablePasswordError(
				parsed.error.issues[0]?.message ?? "Invalid password",
			);
			return;
		}
		setDisablePasswordError(null);
		disableMutation.mutate({ password: parsed.data.password });
	};

	const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Enter" || isBusy) return;
		if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
			return;

		const target = event.target as HTMLElement | null;
		if (!target) return;
		if (
			target.closest("button, a, [role='button']") ||
			target.tagName === "TEXTAREA"
		) {
			return;
		}

		if (uiState === "enableForm") {
			if (!setupPassword.length) return;
			event.preventDefault();
			handleStartSetup();
			return;
		}

		if (uiState === "enableReady") {
			if (!setupData || verificationCode.length !== TOTP_CODE_LENGTH) return;
			event.preventDefault();
			handleVerifyTotp();
			return;
		}

		if (uiState === "enableConfirm") {
			if (!backupCodesSaved) return;
			event.preventDefault();
			void handleFinalizeSetup();
		}
	};

	const isDialogOpen = uiState !== "idle";

	const closeFlowDialog = async () => {
		if (isBusy) return;
		if (uiState === "enableConfirm" && !backupCodesSaved) {
			toast.error("Please confirm that you saved your backup codes first");
			return;
		}
		const shouldSyncProfile = uiState === "enableConfirm";
		resetEnableFlow();
		resetDisableFlow();
		setUIState("idle");
		if (shouldSyncProfile) {
			try {
				await refreshProfileState();
			} catch (error) {
				toast.error(
					getErrorMessage(
						error,
						"Two-factor status changed, but profile refresh failed. Reload the page.",
					),
				);
			}
		}
	};

	const getDialogContentMeta = () => {
		if (uiState === "enableForm") {
			return {
				title: "Enable authenticator setup",
				description:
					"Confirm your password to start the authenticator setup flow.",
			};
		}
		if (uiState === "enableReady") {
			return {
				title: "Verify authenticator code",
				description:
					"Scan the QR code and enter the 6-digit code from your authenticator app to continue.",
			};
		}
		if (uiState === "enableConfirm") {
			return {
				title: "Save backup codes",
				description:
					"Two-factor is active. Save these backup codes now to recover access if you lose your authenticator device.",
			};
		}
		if (uiState === "disableForm") {
			return {
				title: "Disable two-factor",
				description:
					"Confirm your password to turn off two-factor authentication.",
			};
		}
		return {
			title: "Two-factor authentication",
			description: "",
		};
	};

	const dialogMeta = getDialogContentMeta();

	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<h2 className="font-semibold text-base">Two-factor authentication</h2>
				<Switch
					checked={isTwoFactorEnabled}
					onCheckedChange={handleToggleChange}
					disabled={isBusy || !profile.data || uiState !== "idle"}
					aria-label="Toggle two-factor authentication"
				/>
			</div>

			<Dialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					if (!open) void closeFlowDialog();
				}}
			>
				<DialogContent className="sm:max-w-lg" onKeyDown={handleDialogKeyDown}>
					<DialogHeader>
						<DialogTitle>{dialogMeta.title}</DialogTitle>
						<DialogDescription>{dialogMeta.description}</DialogDescription>
					</DialogHeader>

					{uiState === "enableForm" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="two-factor-enable-password">Password</Label>
								<Input
									id="two-factor-enable-password"
									type="password"
									value={setupPassword}
									onChange={(event) => {
										setSetupPassword(event.target.value);
										setSetupPasswordError(null);
									}}
									disabled={isBusy}
									placeholder="Enter your current password"
									autoComplete="current-password"
								/>
								{setupPasswordError ? (
									<p className="text-destructive text-xs">
										{setupPasswordError}
									</p>
								) : null}
							</div>

							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => void closeFlowDialog()}
									disabled={isBusy}
								>
									Cancel
								</Button>
								<Button
									type="button"
									onClick={handleStartSetup}
									disabled={isBusy || setupPassword.length === 0}
								>
									{enableMutation.isPending ? "Preparing..." : "Continue"}
								</Button>
							</div>
						</div>
					)}

					{uiState === "enableReady" && setupData && (
						<div className="space-y-4">
							<div className="flex flex-col items-center gap-3">
								{showManualSetupKey ? (
									<div className="w-full max-w-sm">
										<DetailCard
											label="Manual setup key"
											value={setupData.secret}
											copyValue={setupData.secret}
										/>
									</div>
								) : (
									<div className="rounded-lg border border-border/70 bg-white p-3">
										<QRCode value={setupData.totpURI} size={156} />
									</div>
								)}

								<button
									type="button"
									className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
									onClick={() => setShowManualSetupKey((current) => !current)}
									disabled={isBusy}
								>
									{showManualSetupKey
										? "Show QR code instead"
										: "Trouble scanning?"}
								</button>
							</div>

							<div className="space-y-2">
								<Label htmlFor="two-factor-code" className="block text-center">
									Authenticator code
								</Label>
								<InputOTP
									id="two-factor-code"
									maxLength={TOTP_CODE_LENGTH}
									value={verificationCode}
									onChange={(value) => {
										setVerificationCode(value);
										setVerificationError(null);
									}}
									containerClassName="justify-center"
									disabled={isBusy}
									pattern="^[0-9]+$"
								>
									<InputOTPGroup>
										{TOTP_SLOT_POSITIONS.map((slot) => (
											<InputOTPSlot key={`totp-slot-${slot}`} index={slot} />
										))}
									</InputOTPGroup>
								</InputOTP>
								{verificationError ? (
									<p className="text-center text-destructive text-xs">
										{verificationError}
									</p>
								) : null}
							</div>

							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => void closeFlowDialog()}
									disabled={isBusy}
								>
									Cancel
								</Button>
								<Button
									type="button"
									onClick={handleVerifyTotp}
									disabled={isBusy || verificationCode.length !== 6}
								>
									{verifyMutation.isPending ? "Verifying..." : "Continue"}
								</Button>
							</div>
						</div>
					)}

					{uiState === "enableConfirm" && setupData && (
						<div className="space-y-4">
							<div className="flex justify-center">
								<ShieldCheck className="size-9 text-emerald-500" />
							</div>

							<DetailCard
								label="Backup codes"
								value={setupData.backupCodes.join("\n")}
								copyValue={setupData.backupCodes.join("\n")}
								preformatted
							/>

							<div className="flex items-start gap-2">
								<Checkbox
									id="two-factor-backup-confirm"
									checked={backupCodesSaved}
									onCheckedChange={(checked) => {
										setBackupCodesSaved(Boolean(checked));
										setBackupCodesError(null);
									}}
									disabled={isBusy}
								/>
								<Label
									htmlFor="two-factor-backup-confirm"
									className="cursor-pointer text-sm leading-5"
								>
									I saved my backup codes in a secure location.
								</Label>
							</div>
							{backupCodesError ? (
								<p className="text-destructive text-xs">{backupCodesError}</p>
							) : null}

							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									type="button"
									onClick={handleFinalizeSetup}
									disabled={isBusy || !backupCodesSaved}
								>
									{isFinalizingEnable ? "Finishing..." : "Finish setup"}
								</Button>
							</div>
						</div>
					)}

					{uiState === "disableForm" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="two-factor-disable-password">Password</Label>
								<Input
									id="two-factor-disable-password"
									type="password"
									value={disablePassword}
									onChange={(event) => {
										setDisablePassword(event.target.value);
										setDisablePasswordError(null);
									}}
									disabled={isBusy}
									placeholder="Enter your current password"
									autoComplete="current-password"
								/>
								{disablePasswordError ? (
									<p className="text-destructive text-xs">
										{disablePasswordError}
									</p>
								) : null}
							</div>

							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => void closeFlowDialog()}
									disabled={isBusy}
								>
									Cancel
								</Button>
								<Button
									type="button"
									variant="destructive"
									onClick={handleDisable}
									disabled={isBusy || disablePassword.length === 0}
								>
									{disableMutation.isPending
										? "Disabling..."
										: "Disable two-factor"}
								</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
