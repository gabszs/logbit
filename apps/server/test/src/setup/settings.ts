import { afterAll, beforeAll } from "bun:test";
import { settings } from "@/env";

type TestSettings = typeof settings;
type SettingsOverrides = Partial<TestSettings>;

const baselineSettings = structuredClone(settings) as TestSettings;
const settingsKeys = Object.keys(baselineSettings) as (keyof TestSettings)[];

const restoreSettingsFrom = (source: TestSettings) => {
	for (const key of settingsKeys) {
		settings[key] = structuredClone(source[key]);
	}
};

export const resetTestSettings = () => {
	restoreSettingsFrom(baselineSettings);
};

export const applyTestSettings = (overrides: SettingsOverrides = {}) => {
	resetTestSettings();
	Object.assign(settings, overrides);
};

export const isolateTestSettings = (overrides: SettingsOverrides = {}) => {
	applyTestSettings(overrides);
	beforeAll(() => applyTestSettings(overrides));
	afterAll(() => resetTestSettings());
};

