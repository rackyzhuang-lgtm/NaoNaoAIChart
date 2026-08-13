import { describe, expect, it } from "vitest";

import { panViewport, resolveCanvasPointerGesture } from "./canvas-pointer-gesture";

describe("resolveCanvasPointerGesture", () => {
    it("pans with a primary-button drag on the background in select mode", () => {
        expect(resolveCanvasPointerGesture({ button: 0, isBackground: true, activeTool: "select", shiftKey: false })).toBe("pan");
    });

    it("keeps background box selection available with Shift", () => {
        expect(resolveCanvasPointerGesture({ button: 0, isBackground: true, activeTool: "select", shiftKey: true })).toBe("select");
    });

    it("leaves primary-button node gestures to node selection and dragging", () => {
        expect(resolveCanvasPointerGesture({ button: 0, isBackground: false, activeTool: "select", shiftKey: false })).toBe("ignore");
    });

    it("pans from nodes when the pan tool is active", () => {
        expect(resolveCanvasPointerGesture({ button: 0, isBackground: false, activeTool: "pan", shiftKey: false })).toBe("pan");
    });

    it("preserves middle-button panning and ignores secondary-button gestures", () => {
        expect(resolveCanvasPointerGesture({ button: 1, isBackground: false, activeTool: "select", shiftKey: false })).toBe("pan");
        expect(resolveCanvasPointerGesture({ button: 2, isBackground: true, activeTool: "select", shiftKey: false })).toBe("ignore");
    });

    it("moves the viewport by the pointer delta without changing zoom", () => {
        expect(panViewport({ x: 240, y: 160, k: 1.5 }, { x: 35, y: -20 })).toEqual({ x: 275, y: 140, k: 1.5 });
    });
});
