import { defineConfig } from "vitest/config";
import * as path from "node:path";

const web = path.resolve(__dirname, "../../apps/web");

export default defineConfig({
  resolve: {
    alias: {
      // The route handlers under test import @opennextjs/cloudflare through
      // apps/web's own copy; pointing the tests' mocks at that same copy is
      // what makes `vi.mock("@opennextjs/cloudflare")` apply to them.
      "@opennextjs/cloudflare": path.resolve(web, "node_modules/@opennextjs/cloudflare"),
      // The same for next/server: the health route's `connection()` is mocked
      // (it only marks the route request-time, and throws outside a request),
      // and the proxy's NextRequest must be the class the proxy itself uses.
      "next/server": path.resolve(web, "node_modules/next/server.js"),
      "@": web,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
