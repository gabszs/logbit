import { useCallback, useEffect, useRef, useState } from "react";

type ResizeDirection = "left" | "right";

interface UsePanelResizeOptions {
	/**
	 * Which edge the drag handle lives on.
	 * - `"left"`:  handle is on the left edge → dragging left makes the panel wider
	 * - `"right"`: handle is on the right edge → dragging right makes the panel wider
	 */
	direction: ResizeDirection;
	/** Default width in pixels at the current viewport (converted to a proportion internally). */
	defaultWidth: number;
	/** Minimum width in pixels. */
	minWidth: number;
	/** Maximum width in pixels. */
	maxWidth: number;
}

interface UsePanelResizeResult {
	/** Current width in CSS pixels. */
	width: number;
	/** Whether the user is currently dragging. */
	isResizing: boolean;
	/** Reset width back to the configured `defaultWidth` proportion. */
	resetToDefault: () => void;
	/**
	 * Callback ref — attach to the drag-handle element.
	 * Automatically sets up / tears down listeners when the element
	 * mounts / unmounts (handles conditional rendering correctly).
	 */
	handleRef: (node: HTMLDivElement | null) => void;
}

/**
 * Lightweight pointer-drag hook for horizontal panel resizing.
 *
 * Internally stores width as a viewport proportion so the panel maintains
 * its visual size when the user zooms (browser zoom changes window.innerWidth).
 * A window resize listener keeps the displayed pixel width in sync.
 *
 * Uses a callback ref so listeners are correctly (re-)attached even when
 * the handle element is conditionally rendered (e.g. collapsed/expanded).
 */
export function usePanelResize({
	direction,
	defaultWidth,
	minWidth,
	maxWidth,
}: UsePanelResizeOptions): UsePanelResizeResult {
	// Store width as a proportion of the viewport (0–1) so that zooming
	// keeps the panel at the same fraction of the visible screen.
	const [proportion, setProportion] = useState(
		() => defaultWidth / window.innerWidth,
	);
	const [innerWidth, setInnerWidth] = useState(window.innerWidth);
	const [isResizing, setIsResizing] = useState(false);

	// Recompute pixel width from the stored proportion whenever the viewport changes.
	const width = Math.min(
		maxWidth,
		Math.max(minWidth, Math.round(proportion * innerWidth)),
	);

	// Store mutable values in refs to avoid stale closures inside
	// the native event listeners.
	const stateRef = useRef({
		direction,
		minWidth,
		maxWidth,
		defaultWidth,
		innerWidth: window.innerWidth,
		startX: 0,
		startWidth: 0,
	});
	stateRef.current.direction = direction;
	stateRef.current.minWidth = minWidth;
	stateRef.current.maxWidth = maxWidth;
	stateRef.current.defaultWidth = defaultWidth;
	stateRef.current.innerWidth = innerWidth;

	// Update innerWidth on viewport changes (window resize includes browser zoom).
	useEffect(() => {
		const handler = () => setInnerWidth(window.innerWidth);
		window.addEventListener("resize", handler, { passive: true });
		return () => window.removeEventListener("resize", handler);
	}, []);

	// Stable listener references so we can remove them reliably.
	const listenersRef = useRef<{
		onPointerDown: (e: PointerEvent) => void;
		onPointerMove: (e: PointerEvent) => void;
		onPointerUp: () => void;
		onDoubleClick: () => void;
	} | null>(null);

	// Track the currently-attached DOM node so we can clean up.
	const nodeRef = useRef<HTMLDivElement | null>(null);

	// Create stable listeners once.
	if (listenersRef.current === null) {
		let rafId = 0;

		const onPointerMove = (e: PointerEvent) => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				const s = stateRef.current;
				const delta = e.clientX - s.startX;
				const newWidth =
					s.direction === "left" ? s.startWidth - delta : s.startWidth + delta;
				const clamped = Math.min(s.maxWidth, Math.max(s.minWidth, newWidth));
				// Store as proportion so the size is preserved across zoom changes.
				setProportion(clamped / s.innerWidth);
			});
		};

		const onPointerUp = () => {
			setIsResizing(false);
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		const onPointerDown = (e: PointerEvent) => {
			e.preventDefault();
			stateRef.current.startX = e.clientX;
			const panel = nodeRef.current?.parentElement;
			stateRef.current.startWidth = panel
				? panel.getBoundingClientRect().width
				: stateRef.current.defaultWidth;

			setIsResizing(true);
			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		};

		const onDoubleClick = () => {
			const s = stateRef.current;
			setProportion(s.defaultWidth / s.innerWidth);
		};

		listenersRef.current = {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onDoubleClick,
		};
	}

	/**
	 * Callback ref — called by React whenever the handle element
	 * enters or leaves the DOM (including conditional renders like
	 * collapsed ↔ expanded).
	 */
	const handleRef = useCallback((node: HTMLDivElement | null) => {
		const listeners = listenersRef.current;
		if (!listeners) return;

		// Detach from previous node (if any).
		if (nodeRef.current) {
			nodeRef.current.removeEventListener(
				"pointerdown",
				listeners.onPointerDown,
			);
			nodeRef.current.removeEventListener("dblclick", listeners.onDoubleClick);
		}

		nodeRef.current = node;

		// Attach to new node (if any).
		if (node) {
			node.addEventListener("pointerdown", listeners.onPointerDown);
			node.addEventListener("dblclick", listeners.onDoubleClick);
		}
	}, []);

	// Global cleanup on unmount.
	useEffect(() => {
		return () => {
			const listeners = listenersRef.current;
			if (!listeners) return;
			document.removeEventListener("pointermove", listeners.onPointerMove);
			document.removeEventListener("pointerup", listeners.onPointerUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			if (nodeRef.current) {
				nodeRef.current.removeEventListener(
					"pointerdown",
					listeners.onPointerDown,
				);
				nodeRef.current.removeEventListener(
					"dblclick",
					listeners.onDoubleClick,
				);
			}
		};
	}, []);

	const resetToDefault = useCallback(() => {
		const s = stateRef.current;
		setProportion(s.defaultWidth / s.innerWidth);
	}, []);

	return { width, isResizing, resetToDefault, handleRef };
}
