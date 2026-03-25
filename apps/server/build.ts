/// <reference types="bun-types" />

await Bun.build({
	entrypoints: ["./src/index.ts"],
	outdir: "./dist",
	target: "bun",
	minify: true,
	sourcemap: "external",
});

export {};
