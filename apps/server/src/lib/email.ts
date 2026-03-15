interface VerificationCodeEmailProps {
	otp: string;
}

export const renderVerificationCodeEmail = async (otp: string): Promise<string> => {
	return generateVerificationCodeEmail({ otp });
};

const generateVerificationCodeEmail = ({ otp }: VerificationCodeEmailProps): string => {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Verification Code</title>
</head>
<body style="${getMainStyles()}">
	<div style="display: none;">Your verification code: ${otp}</div>
	<div style="${getContainerStyles()}">
		<h1 style="${getH1Styles()}">Verification Code</h1>
		<p style="${getTextStyles()}">
			Here is your verification code to sign in to your account:
		</p>
		<div style="${getCodeContainerStyles()}">
			<p style="${getCodeStyles()}">${otp}</p>
		</div>
		<p style="${getTextStyles()}">
			This code will expire in 10 minutes. If you didn't request this code,
			you can safely ignore this email.
		</p>
		<p style="${getFooterStyles()}">
			Best regards,<br>
			traki
		</p>
	</div>
</body>
</html>`;
};

const getMainStyles = () => `
	background-color: #ffffff;
	font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;
	margin: 0;
	padding: 0;
`;

const getContainerStyles = () => `
	margin: 0 auto;
	padding: 20px 0 48px;
	max-width: 560px;
`;

const getH1Styles = () => `
	color: #333;
	font-size: 24px;
	font-weight: 600;
	line-height: 40px;
	margin: 0 0 20px;
`;

const getTextStyles = () => `
	color: #333;
	font-size: 16px;
	line-height: 24px;
	margin: 0 0 20px;
`;

const getCodeContainerStyles = () => `
	background: #f6f9fc;
	border-radius: 4px;
	margin: 16px 0;
	text-align: center;
	padding: 20px;
`;

const getCodeStyles = () => `
	color: #000;
	font-size: 32px;
	font-weight: 700;
	letter-spacing: 6px;
	line-height: 40px;
	margin: 0;
	font-family: monospace;
`;

const getButtonStyles = () => `
	background-color: #007bff;
	color: white;
	text-decoration: none;
	padding: 12px 24px;
	border-radius: 6px;
	display: inline-block;
	font-weight: 600;
`;

const getFooterStyles = () => `
	color: #8898aa;
	font-size: 12px;
	line-height: 16px;
	margin: 20px 0 0;
`;

export const renderResetPasswordEmail = async ({
	name,
	url,
}: {
	name: string;
	url: string;
}): Promise<string> => {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Reset your password</title>
</head>
<body style="${getMainStyles()}">
	<div style="${getContainerStyles()}">
		<h1 style="${getH1Styles()}">Reset your password</h1>
		<p style="${getTextStyles()}">Hi ${name},</p>
		<p style="${getTextStyles()}">
			We received a request to reset your password. Click the button below to reset it:
		</p>
		<p style="text-align:center;">
			<a href="${url}" style="${getButtonStyles()}">Reset Password</a>
		</p>
		<p style="${getTextStyles()}">
			If you didn’t request this, you can safely ignore this email.
		</p>
		<p style="${getFooterStyles()}">
			Best regards,<br>
			traki
		</p>
	</div>
</body>
</html>`;
};

/**
 * Generates the account verification email
 */
export const renderVerificationEmail = async ({
	name,
	url,
}: {
	name: string;
	url: string;
}): Promise<string> => {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Verify your email</title>
</head>
<body style="${getMainStyles()}">
	<div style="${getContainerStyles()}">
		<h1 style="${getH1Styles()}">Verify your email</h1>
		<p style="${getTextStyles()}">Hi ${name},</p>
		<p style="${getTextStyles()}">
			Thanks for signing up! Please confirm your email address by clicking the button below:
		</p>
		<p style="text-align:center;">
			<a href="${url}" style="${getButtonStyles()}">Verify Email</a>
		</p>
		<p style="${getTextStyles()}">
			If you didn’t create an account, you can safely ignore this email.
		</p>
		<p style="${getFooterStyles()}">
			Best regards,<br>
			traki
		</p>
	</div>
</body>
</html>`;
};

export { generateVerificationCodeEmail as VerificationCodeEmail };
