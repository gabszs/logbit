import { describe, expect, it } from "bun:test";

describe("getLogsSidebarSections", () => {
	it("shows log levels only for log sources and trace controls only for traces", async () => {
		const { SourceType } = await import("@/web/lib/source-types");
		const { getLogsSidebarSections } = await import("./logs-sidebar-preview");

		expect(getLogsSidebarSections(SourceType.Log)).toEqual({
			logLevel: true,
			traceControls: false,
			spanName: false,
		});
		expect(getLogsSidebarSections(SourceType.Trace)).toEqual({
			logLevel: false,
			traceControls: true,
			spanName: true,
		});
	});
});
