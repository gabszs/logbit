import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "logs-canvas-sidebar-expanded";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

function getSnapshot(): boolean {
	const storedValue = localStorage.getItem(STORAGE_KEY);
	return storedValue === null ? true : storedValue === "true";
}

function getServerSnapshot(): boolean {
	return true;
}

function emitChange() {
	for (const listener of listeners) {
		listener();
	}
}

export function useLogsCanvasSidebar() {
	const isExpanded = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	const toggle = useCallback(() => {
		const next = !getSnapshot();
		localStorage.setItem(STORAGE_KEY, String(next));
		emitChange();
	}, []);

	return { isExpanded, toggle };
}
