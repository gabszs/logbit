import { type ResolveConfigFn } from "@microlabs/otel-cf-workers";
import { trace } from "@opentelemetry/api";

export function InstrumentClass(): ClassDecorator {
	return (target: Function) => {
		let currentProto = target.prototype;

		// Percorre a árvore de herança
		while (currentProto && currentProto !== Object.prototype) {
			const propertyNames = Object.getOwnPropertyNames(currentProto);

			for (const propertyName of propertyNames) {
				// 1. Pula o constructor
				// 2. SÓ decora se for função
				// 3. EVITA decorar métodos internos do Drizzle/Helpers (importante!)
				if (
					propertyName === "constructor" ||
					typeof currentProto[propertyName] !== "function" ||
					propertyName.startsWith("apply") || // Ignora applyFilters, applySearchOptions
					propertyName.startsWith("_") // Ignora métodos privados por convenção
				) {
					continue;
				}

				const descriptor = Object.getOwnPropertyDescriptor(currentProto, propertyName);
				if (!descriptor || descriptor.get || descriptor.set) continue;

				const originalMethod = descriptor.value;

				// Verifica se já não decoramos este método (evita duplicidade na herança)
				if (originalMethod.__isInstrumented) continue;

				const instrumentedMethod = function (this: any, ...args: any[]) {
					const tracer = trace.getTracer("default");
					const spanName = `${target.name}.${propertyName}`;

					return tracer.startActiveSpan(spanName, (span) => {
						try {
							const result = originalMethod.apply(this, args);

							if (result instanceof Promise) {
								return result
									.then((value) => {
										span.end();
										return value;
									})
									.catch((err) => {
										span.recordException(err);
										span.setStatus({ code: 2 });
										span.end();
										throw err;
									});
							}

							span.end();
							return result;
						} catch (err) {
							span.recordException(err as Error);
							span.setStatus({ code: 2 });
							span.end();
							throw err;
						}
					});
				};

				// Marca como instrumentado e substitui
				(instrumentedMethod as any).__isInstrumented = true;
				Object.defineProperty(currentProto, propertyName, {
					...descriptor,
					value: instrumentedMethod,
				});
			}

			currentProto = Object.getPrototypeOf(currentProto);
		}
	};
}

export function buildOtelQueryAttributeMap(
	queryParams: QueryParams,
	options?: {
		denylist?: string[];
		prefix?: string;
		maxParams?: number;
	},
): Record<string, string> {
	const { denylist = [], prefix = "url.query", maxParams = 20 } = options ?? {};

	return Object.fromEntries(
		Object.entries(queryParams)
			.filter(([, value]) => value !== undefined)
			.filter(([key]) => !denylist.includes(key.toLowerCase()))
			.slice(0, maxParams)
			.map(([key, value]) => [
				`${prefix}.${key}`,
				Array.isArray(value) ? value.join(",") : String(value),
			]),
	);
}

export const otel_config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		service: { name: env.OTEL_SERVICE_NAME },
		exporter: {
			url: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
		},
		// sampling: {
		// 	headSampler: { ratio: 0.05 },
		// 	tailSampler: (traceInfo: LocalTrace): boolean => {
		// 		const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan;
		// 		// console.log(localRootSpan.attributes);

		// 		if (localRootSpan.attributes["service.environment"] !== "production") return true;
		// 		if (localRootSpan.attributes.duration_ms > 500) return true;
		// 		if (localRootSpan.attributes["outcome"] !== "success") return true;
		// 		if (localRootSpan.status.code === SpanStatusCode.UNSET) return false;
		// 		if (localRootSpan.status.code === SpanStatusCode.ERROR) return true;
		// 		if (localRootSpan.attributes["http.response.status_code"] >= 400) return true;
		// 		// user defined tail sampling logic
		// 		if (localRootSpan.attributes["user.role"] === "admin") return true;
		// 		if (localRootSpan.attributes["user.banned"] === "true") return true;
		// 		if (localRootSpan.attributes["user.assumed"] === "true") return true;
		// 		if (localRootSpan.attributes["user.assumed_by"]) return true;
		// 		if (localRootSpan.attributes["session.expires_at"] < Date.now()) return true;
		// 		return Math.random() < 0.05;
		// 	},
		// },
	};
};
