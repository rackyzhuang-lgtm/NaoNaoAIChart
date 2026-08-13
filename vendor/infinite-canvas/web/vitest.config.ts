import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: webRoot,
    test: {
        environment: "node",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
});
