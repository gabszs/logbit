import { applyD1Migrations, env } from "cloudflare:test";
import { vi } from "vitest";

await applyD1Migrations(env.D1, env.TEST_MIGRATIONS);

vi.stubGlobal("process", {
	env: {
		OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://collector.gabrielcarvalho.dev/v1/traces",
		OTEL_SERVICE_NAME: "cloudflare-rss-vitest",
	},
});

// Mock OpenTelemetry API to prevent Node.js module imports
vi.mock("@opentelemetry/api", () => {
	const mockSpan = {
		setAttribute: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		updateName: vi.fn(),
		addEvent: vi.fn(),
		isRecording: vi.fn(() => true),
		spanContext: vi.fn(() => ({ traceId: "123", spanId: "456" })),
	};

	const mockTracer = {
		startActiveSpan: vi.fn((_name, fn) => {
			return fn(mockSpan);
		}),
		startSpan: vi.fn(() => mockSpan),
	};

	return {
		trace: {
			getActiveSpan: vi.fn(() => mockSpan),
			setSpan: vi.fn(),
			getSpan: vi.fn(() => mockSpan),
			deleteSpan: vi.fn(),
			setSpanContext: vi.fn(),
			getSpanContext: vi.fn(),
			getTracer: vi.fn(() => mockTracer),
		},
		context: {
			active: vi.fn(() => ({})),
			with: vi.fn((_ctx, fn) => fn()),
			bind: vi.fn(),
		},
		SpanStatusCode: {
			OK: 1,
			ERROR: 2,
		},
	};
});

// Mock agents/mcp to prevent OpenTelemetry resource loading
vi.mock("agents/mcp", () => {
	return {
		McpAgent: class MockMcpAgent {
			server: any;
			constructor(_state: any, _env: any) {
				this.server = { init: vi.fn() };
			}
			async init() {
				return Promise.resolve();
			}
		},
	};
});

// Mock @opentelemetry/resources with hoisted functions
const mockResource = vi.hoisted(() => {
	return class MockResource {
		attributes: Record<string, any>;

		constructor(attributes: Record<string, any> = {}) {
			this.attributes = attributes;
		}

		static default() {
			return new MockResource();
		}

		static empty() {
			return new MockResource();
		}

		merge(other: any) {
			return new MockResource({ ...this.attributes, ...other.attributes });
		}
	};
});

const mockDetectResources = vi.hoisted(() => {
	return vi.fn(() => Promise.resolve(new mockResource()));
});

const mockDetector = vi.hoisted(() => {
	return {
		detect: vi.fn(() => Promise.resolve(new mockResource())),
	};
});

vi.mock("@opentelemetry/resources", () => {
	return {
		Resource: mockResource,
		detectResources: mockDetectResources,
		envDetector: mockDetector,
		hostDetector: mockDetector,
		osDetector: mockDetector,
		processDetector: mockDetector,
	};
});

// Mock @microlabs/otel-cf-workers with hoisted functions
const mockInstrumentDO = vi.hoisted(() => {
	return (cls: any, _config: any) => {
		// Create a mock class that extends the original
		class MockInstrumentedClass extends cls {
			static serve = vi.fn((_path: string) => ({
				fetch: vi.fn().mockResolvedValue(new Response("Mock MCP Response", { status: 200 })),
			}));
			static serveSSE = vi.fn((_path: string) => ({
				fetch: vi.fn().mockResolvedValue(new Response("Mock SSE Response", { status: 200 })),
			}));
		}

		// Add static methods to the class itself
		MockInstrumentedClass.serve = vi.fn((_path: string) => ({
			fetch: vi.fn().mockResolvedValue(new Response("Mock MCP Response", { status: 200 })),
		}));
		MockInstrumentedClass.serveSSE = vi.fn((_path: string) => ({
			fetch: vi.fn().mockResolvedValue(new Response("Mock SSE Response", { status: 200 })),
		}));

		return MockInstrumentedClass;
	};
});

const mockInstrument = vi.hoisted(() => {
	return (handler: any, _config: any) => {
		// Return the handler as-is for testing, ensuring it has a fetch method
		return {
			fetch:
				handler.fetch || vi.fn().mockResolvedValue(new Response("Mock Response", { status: 200 })),
			...handler,
		};
	};
});

vi.mock("@microlabs/otel-cf-workers", async (importOriginal) => {
	const _original = await importOriginal();
	return {
		instrument: mockInstrument,
		instrumentDO: mockInstrumentDO,
		ResolveConfigFn: vi.fn(),
	};
});

// Mock mimetext to prevent Node.js usage
const mockMimeMessage = vi.hoisted(() => {
	return class MockMimeMessage {
		private sender: { name: string; addr: string } | null = null;
		private recipient: string | { name?: string; addr: string } | null = null;
		private subject = "";
		private messages: Array<{ contentType: string; data: string }> = [];

		setSender(sender: { name: string; addr: string }) {
			this.sender = sender;
			return this; // Para permitir chaining
		}

		setRecipient(recipient: string | { name?: string; addr: string }) {
			this.recipient = recipient;
			return this; // Para permitir chaining
		}

		setSubject(subject: string) {
			this.subject = subject;
			return this; // Para permitir chaining
		}

		addMessage(message: { contentType: string; data: string }) {
			this.messages.push(message);
			return this; // Para permitir chaining
		}

		asRaw(): string {
			const senderStr = this.sender
				? `${this.sender.name} <${this.sender.addr}>`
				: "Unknown Sender";

			const recipientStr =
				typeof this.recipient === "string"
					? this.recipient
					: this.recipient?.addr || "Unknown Recipient";

			return `From: ${senderStr}
					To: ${recipientStr}
					Subject: ${this.subject}
					Content-Type: ${this.messages[0]?.contentType || "text/plain"}

			${this.messages.map((m) => m.data).join("\n\n")}`;
		}
	};
});

vi.mock("mimetext", () => {
	return {
		createMimeMessage: vi.fn(() => new mockMimeMessage()),
	};
});

// Mock do mimetext
vi.mock("https://esm.sh/mimetext", () => {
	class MockMimeMessage {
		private sender: { name: string; addr: string } | null = null;
		private recipient: string | { name?: string; addr: string } | null = null;
		private subject = "";
		private messages: Array<{ contentType: string; data: string }> = [];

		setSender(sender: { name: string; addr: string }) {
			this.sender = sender;
			return this;
		}

		setRecipient(recipient: string | { name?: string; addr: string }) {
			this.recipient = recipient;
			return this;
		}

		setSubject(subject: string) {
			this.subject = subject;
			return this;
		}

		addMessage(message: { contentType: string; data: string }) {
			this.messages.push(message);
			return this;
		}

		asRaw(): string {
			const senderStr = this.sender
				? `${this.sender.name} <${this.sender.addr}>`
				: "Unknown Sender";

			const recipientStr =
				typeof this.recipient === "string"
					? this.recipient
					: this.recipient?.addr || "Unknown Recipient";

			return `From: ${senderStr}
					To: ${recipientStr}
					Subject: ${this.subject}
					Content-Type: ${this.messages[0]?.contentType || "text/plain"}
					${this.messages.map((m) => m.data).join("\n\n")}`;
		}
	}

	return {
		createMimeMessage: vi.fn(() => new MockMimeMessage()),
	};
});
