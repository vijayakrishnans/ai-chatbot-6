// Upstream registered Vercel's OpenTelemetry exporter (`@vercel/otel`) and the
// AI SDK's span exporter (`@ai-sdk/otel`) here; both ship traces to Vercel's
// observability. A Cloudflare Worker gets its logs and traces from the
// Worker's own observability setting (`observability.enabled` in
// wrangler.jsonc → Workers Logs) without an in-app exporter, so this hook
// registers nothing. The AI SDK's `telemetry` option in the chat route stays
// as written and is a no-op without a registered tracer.
export function register() {
  // Nothing to register on Workers.
}
