// Upstream guards the chat route with Vercel BotID (`checkBotId` from
// `botid/server`, `withBotId` around next.config.ts and `initBotId` in
// instrumentation-client.ts). BotID is a Vercel edge feature with no in-app
// equivalent on Cloudflare: bot traffic to a Worker is handled at the edge by
// Cloudflare Bot Management / Super Bot Fight Mode (a zone setting), or by
// challenging the chat form with Turnstile (https://developers.cloudflare.com/turnstile/).
// This no-op keeps the route's `isBot` branch as written and always lets the
// request through.
export function checkBotId(): Promise<{ isBot: boolean }> {
  return Promise.resolve({ isBot: false });
}
