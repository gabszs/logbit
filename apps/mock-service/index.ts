import { serve } from "bun";

const port = Number(process.env.PORT || 5055);

serve({
	port,
	fetch(req) {
		const url = new URL(req.url);
		const headers: Record<string, string> = {};
		req.headers.forEach((value, key) => {
			headers[key] = value;
		});

		console.log(`[mock-service] Received ${req.method} ${url.pathname}${url.search}`, {
			traceparent: headers.traceparent,
			tracestate: headers.tracestate,
			"x-client-ip": headers["x-client-ip"],
		});

		if (url.pathname.includes("404")) {
			return Response.json(
				{ error: "Not Found", path: url.pathname },
				{ status: 404, headers: { traceparent: headers.traceparent || "" } },
			);
		}

		if (url.pathname.includes("500")) {
			return Response.json(
				{ error: "Internal Server Error", path: url.pathname },
				{ status: 500, headers: { traceparent: headers.traceparent || "" } },
			);
		}

		return Response.json({
			service: "mock-upstream-service",
			method: req.method,
			pathname: url.pathname,
			search: url.search,
			query: Object.fromEntries(url.searchParams.entries()),
			receivedHeaders: headers,
			traceparent: headers.traceparent || null,
			tracestate: headers.tracestate || null,
			timestamp: new Date().toISOString(),
		});
	},
});

console.log(`[mock-service] Mock upstream service listening on http://0.0.0.0:${port}`);

