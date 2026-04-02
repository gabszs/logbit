/// <reference types="bun-types" />

const isContainer = process.argv.includes("--container");

if (isContainer) {
	// Container build: both entrypoints bundled separately
	// otel.ts is preloaded at runtime before index.ts
	await Bun.build({
		entrypoints: ["./src/otel.ts"],
		outdir: "./dist",
		target: "bun",
		minify: true,
		sourcemap: "external",
		naming: "otel.js",
	});

	await Bun.build({
		entrypoints: ["./src/index.ts"],
		outdir: "./dist",
		target: "bun",
		minify: true,
		sourcemap: "external",
		naming: "index.js",
	});
} else {
	await Bun.build({
		entrypoints: ["./src/index.ts"],
		outdir: "./dist",
		target: "bun",
		minify: true,
		sourcemap: "external",
	});
}

export {};
