import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/web/components/ui/input-otp";
import { Label } from "@/web/components/ui/label";
import { authClient } from "@/web/lib/auth-client";
import { SIGN_IN_FORM } from "@/web/lib/constants";
import { twoFactorVerifySchema } from "@/web/lib/validators";
import { FALLBACK_REDIRECT } from "../-utils/redirect";

interface TwoFactorFormProps {
	redirectPath: string;
	username?: string;
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

const isExpiredTwoFactorChallenge = (message: string): boolean => {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("invalid two factor cookie") ||
		normalized.includes("two factor isn't enabled") ||
		normalized.includes("totp not enabled")
	);
};

export function TwoFactorForm({ redirectPath, username }: TwoFactorFormProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const [verificationCode, setVerificationCode] = useState("");
	const [verificationError, setVerificationError] = useState<string | null>(
		null,
	);

	const navigateBackToSignIn = () =>
		navigate({
			to: "/auth/sign-in",
			replace: true,
			search:
				redirectPath !== FALLBACK_REDIRECT
					? { redirect: redirectPath }
					: undefined,
		});

	const verifyMutation = useMutation({
		mutationFn: async ({ code }: { code: string }) => {
			const parsed = twoFactorVerifySchema.safeParse({ code });
			if (!parsed.success) {
				throw new Error(
					parsed.error.issues[0]?.message ?? "Invalid verification code",
				);
			}

			const result = await authClient.twoFactor.verifyTotp({
				code: parsed.data.code,
				trustDevice: false,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Failed to verify authentication code"),
				);
			}
		},
		onSuccess: async () => {
			setVerificationError(null);
			toast.success(SIGN_IN_FORM.SUCCESS_MESSAGES.SIGN_IN_SUCCESS);
			await router.invalidate();
			await navigate({
				to: redirectPath,
				replace: true,
			});
		},
		onError: (error) => {
			const errorMessage = getErrorMessage(
				error,
				"Failed to verify authentication code",
			);

			if (isExpiredTwoFactorChallenge(errorMessage)) {
				toast.error("Two-factor session expired. Please sign in again.");
				void navigateBackToSignIn();
				return;
			}

			setVerificationError(errorMessage);
			toast.error(errorMessage);
		},
	});

	const isBusy = verifyMutation.isPending;

	const handleVerify = () => {
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

	const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
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

		if (verificationCode.length !== TOTP_CODE_LENGTH) return;
		event.preventDefault();
		handleVerify();
	};

	return (
		<div className="w-full max-w-md">
			<h1 className="mb-5 text-center font-bold text-3xl">
				Verify your <span className="text-primary">LogBit</span> login
			</h1>

			<form
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					handleVerify();
				}}
				onKeyDown={handleFormKeyDown}
				className="space-y-5"
			>
				<div className="space-y-4 rounded-lg border border-border bg-card p-5">
					<p className="text-center text-muted-foreground text-sm">
						Enter the 6-digit code from your authenticator app.
					</p>

					<div className="h-px w-full bg-border/70" />

					<div className="space-y-1 text-left">
						<p className="font-medium text-sm">Username:</p>
						<div className="flex flex-wrap items-center justify-start gap-x-1 gap-y-0.5 text-sm">
							<span className="break-all font-medium">
								{username || "Unknown user"}
							</span>
							<button
								type="button"
								className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
								onClick={() => {
									void navigateBackToSignIn();
								}}
								disabled={isBusy}
							>
								(not you?)
							</button>
						</div>
					</div>

					<div className="h-px w-full bg-border/70" />

					<div className="space-y-2">
						<Label
							htmlFor="auth-two-factor-code"
							className="mb-1 block text-center tracking-[0.22em]"
						>
							MFA CODE
						</Label>
						<InputOTP
							id="auth-two-factor-code"
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
									<InputOTPSlot
										key={`auth-two-factor-slot-${slot}`}
										index={slot}
									/>
								))}
							</InputOTPGroup>
						</InputOTP>
						{verificationError ? (
							<p className="text-center text-destructive text-xs">
								{verificationError}
							</p>
						) : null}
					</div>

					<div className="flex flex-col-reverse items-center gap-2 sm:flex-row sm:justify-center">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								void navigateBackToSignIn();
							}}
							disabled={isBusy}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isBusy || verificationCode.length !== TOTP_CODE_LENGTH}
						>
							{verifyMutation.isPending
								? "Verifying..."
								: "Verify and continue"}
						</Button>
					</div>
				</div>
			</form>
		</div>
	);
}
