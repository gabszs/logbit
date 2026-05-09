import { useEffect, useRef, useState } from "react";

type ResizeDirection = "left" | "right";

interface UsePanelResizeOptions {
	/**
	 * Which edge the drag handle lives on.
	 * - `"left"`:  handle is on the left edge → dragging left makes the panel wider
	 * - `"right"`: handle is on the right edge → dragging right makes the panel wider
	 */
	direction: ResizeDirection;
	/** Default (initial) width in pixels. */
	defaultWidth: number;
	/** Minimum width in pixels. */
	minWidth: number;
	/** Maximum width in pixels. */
	maxWidth: number;
}

interface UsePanelResizeResult {
	/** Current width in pixels. */
	width: number;
	/** Whether the user is currently dragging. */
	isResizing: boolean;
	/** Reset width back to the configured `defaultWidth`. */
	resetToDefault: () => void;
	/** Ref to attach to the drag-handle element. */
	handleRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Lightweight pointer-drag hook for horizontal panel resizing.
 *
 * Attaches native `pointerdown` → `pointermove` → `pointerup` listeners
 * via a ref so it works correctly with the React Compiler and avoids
 * stale-closure issues.
 */
export function usePanelResize({
	direction,
	defaultWidth,
	minWidth,
	maxWidth,
}: UsePanelResizeOptions): UsePanelResizeResult {
	const [width, setWidth] = useState(defaultWidth);
	const [isResizing, setIsResizing] = useState(false);
	const handleRef = useRef<HTMLDivElement | null>(null);

	// Store mutable values in refs to avoid stale closures.
	const stateRef = useRef({
		direction,
		minWidth,
		maxWidth,
		defaultWidth,
		startX: 0,
		startWidth: 0,
	});
	stateRef.current.direction = direction;
	stateRef.current.minWidth = minWidth;
	stateRef.current.maxWidth = maxWidth;
	stateRef.current.defaultWidth = defaultWidth;

	useEffect(() => {
		const handle = handleRef.current;
		if (!handle) return;

		function onPointerMove(e: PointerEvent) {
			const s = stateRef.current;
			const delta = e.clientX - s.startX;
			const newWidth =
				s.direction === "left" ? s.startWidth - delta : s.startWidth + delta;
			setWidth(Math.min(s.maxWidth, Math.max(s.minWidth, newWidth)));
		}

		function onPointerUp() {
			setIsResizing(false);
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		}

		function onPointerDown(e: PointerEvent) {
			e.preventDefault();
			stateRef.current.startX = e.clientX;
			// Read the *current* computed width of the panel's parent (the
			// element right before the handle in DOM) so we always start from
			// the real rendered width, not a stale React state value.
			const panel = handle.parentElement;
			stateRef.current.startWidth = panel
				? panel.getBoundingClientRect().width
				: stateRef.current.defaultWidth;

			setIsResizing(true);
			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		}

		function onDoubleClick() {
			setWidth(stateRef.current.defaultWidth);
		}

		handle.addEventListener("pointerdown", onPointerDown);
		handle.addEventListener("dblclick", onDoubleClick);

		return () => {
			handle.removeEventListener("pointerdown", onPointerDown);
			handle.removeEventListener("dblclick", onDoubleClick);
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, []);

	const resetToDefault = () => {
		setWidth(stateRef.current.defaultWidth);
	};

	return { width, isResizing, resetToDefault, handleRef };
}
