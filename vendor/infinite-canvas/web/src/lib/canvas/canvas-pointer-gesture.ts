export type CanvasTool = "select" | "pan";

type CanvasPointerGestureInput = {
    button: number;
    isBackground: boolean;
    activeTool: CanvasTool;
    shiftKey: boolean;
};

export type CanvasPointerGesture = "pan" | "select" | "ignore";

export function resolveCanvasPointerGesture({ button, isBackground, activeTool, shiftKey }: CanvasPointerGestureInput): CanvasPointerGesture {
    if (button === 1) return "pan";
    if (button !== 0) return "ignore";
    if (activeTool === "pan") return "pan";
    if (!isBackground) return "ignore";
    return shiftKey ? "select" : "pan";
}

export function panViewport(initial: { x: number; y: number; k: number }, delta: { x: number; y: number }) {
    return {
        x: initial.x + delta.x,
        y: initial.y + delta.y,
        k: initial.k,
    };
}
