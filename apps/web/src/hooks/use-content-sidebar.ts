import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "sidebar-expanded"

const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
	listeners.add(callback)
	return () => listeners.delete(callback)
}

function getSnapshot(): boolean {
	return localStorage.getItem(STORAGE_KEY) === "true"
}

function getServerSnapshot(): boolean {
	return false
}

function emitChange() {
	for (const listener of listeners) {
		listener()
	}
}

export function useContentSidebar() {
	const isExpanded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

	const toggle = useCallback(() => {
		const next = !getSnapshot()
		localStorage.setItem(STORAGE_KEY, String(next))
		emitChange()
	}, [])

	return { isExpanded, toggle }
}
