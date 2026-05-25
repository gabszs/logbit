import { describe, expect, it } from "bun:test";
import type { DynamicFacetViewField } from "../-lib/logs-facets";

describe("getLogsSidebarSections", () => {
	it("shows trace controls only for trace sources", async () => {
		const { SourceType } = await import("@/web/lib/source-types");
		const { getLogsSidebarSections } = await import("./logs-sidebar-preview");

		expect(getLogsSidebarSections(SourceType.Log)).toEqual({
			traceControls: false,
			spanName: false,
		});
		expect(getLogsSidebarSections(SourceType.Trace)).toEqual({
			traceControls: true,
			spanName: true,
		});
	});

	it("recognizes Body custom contains facets and counts selected custom rows", async () => {
		const { getFacetSelectedCount, isBodyCustomFacet } = await import(
			"./logs-sidebar-preview"
		);
		const bodyField = {
			id: "column:Body",
			kind: "column",
			label: "Body",
			column: "Body",
			dataType: "String",
			filterMode: "contains",
			total: 1,
			options: [
				{
					value: "full body value",
					count: 1,
					included: true,
					excluded: false,
				},
			],
			customOptions: [
				{
					value: "caller",
					count: 1,
					included: false,
					excluded: true,
				},
			],
		} satisfies DynamicFacetViewField;

		expect(isBodyCustomFacet(bodyField)).toBe(true);
		expect(getFacetSelectedCount(bodyField)).toBe(2);
	});
});
