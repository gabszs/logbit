# Envio de Email (Resend + Cloudflare) com foco em IA

Este guia resume dois jeitos simples de enviar email no servidor:

1. Resend SDK
2. Cloudflare SDK (`emailSending.send`)

A ideia é deixar pronto para fluxos de IA: gerar conteúdo com modelo e enviar com provider.

## Placeholders de ambiente

Use variáveis de ambiente, sem chave fixa no código:

```env
# Resend
RESEND_API_KEY=YOUR_RESEND_API_KEY

# Cloudflare
CLOUDFLARE_API_TOKEN=YOUR_CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID

# Comum
EMAIL_FROM="Seu App <no-reply@seudominio.com>"
EMAIL_TO_TEST="destinatario@exemplo.com"
```

## Exemplo mínimo: Resend

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendWithResend() {
	const { data, error } = await resend.emails.send({
		from: process.env.EMAIL_FROM!,
		to: [process.env.EMAIL_TO_TEST!],
		subject: "Teste de envio com Resend",
		html: "<strong>Funcionou!</strong>",
		text: "Funcionou!",
	});

	if (error) throw error;
	return data;
}
```

## Exemplo mínimo: Cloudflare

```ts
import Cloudflare from "cloudflare";

const client = new Cloudflare({
	apiToken: process.env.CLOUDFLARE_API_TOKEN!,
	timeout: 20_000,
	maxRetries: 2,
});

export async function sendWithCloudflare() {
	return client.emailSending.send({
		account_id: process.env.CLOUDFLARE_ACCOUNT_ID!,
		from: process.env.EMAIL_FROM!,
		to: [process.env.EMAIL_TO_TEST!],
		subject: "Teste de envio com Cloudflare",
		html: "<strong>Funcionou via Cloudflare!</strong>",
		text: "Funcionou via Cloudflare!",
	});
}
```

## Fluxo simples com IA

Padrão recomendado:

1. IA gera `subject`, `html` e `text` a partir de contexto de negócio.
2. Backend valida tamanho/campos obrigatórios.
3. Backend envia com provider (Resend ou Cloudflare).
4. Backend registra resultado (`messageId`, status, erro).

Exemplo direto:

```ts
type AIGeneratedEmail = {
	subject: string;
	html: string;
	text: string;
};

async function sendAiEmail(content: AIGeneratedEmail) {
	// Troque por sua regra: fallback, tenant, custo, etc.
	const provider = "resend" as const;

	if (provider === "resend") {
		const resend = new Resend(process.env.RESEND_API_KEY!);
		return resend.emails.send({
			from: process.env.EMAIL_FROM!,
			to: [process.env.EMAIL_TO_TEST!],
			subject: content.subject,
			html: content.html,
			text: content.text,
		});
	}

	const cloudflare = new Cloudflare({
		apiToken: process.env.CLOUDFLARE_API_TOKEN!,
	});

	return cloudflare.emailSending.send({
		account_id: process.env.CLOUDFLARE_ACCOUNT_ID!,
		from: process.env.EMAIL_FROM!,
		to: [process.env.EMAIL_TO_TEST!],
		subject: content.subject,
		html: content.html,
		text: content.text,
	});
}
```

## Checklist rápido para IA + email

1. Nunca retornar secrets no prompt/resposta do modelo.
2. Sanitizar HTML antes de enviar.
3. Ter fallback de provider para reduzir falha de entrega.
4. Logar erro com contexto (`provider`, `status`, `requestId`).
5. Usar idempotência quando houver retry automático.
