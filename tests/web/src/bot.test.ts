import { describe, expect, it } from "vitest";
import { checkBotId } from "@/lib/bot";

// The BotID stand-in: bot handling moved to the Cloudflare edge, so the chat
// route's `isBot` branch never fires.
describe("checkBotId (lib/bot.ts)", () => {
  it("never flags a request", async () => {
    await expect(checkBotId()).resolves.toEqual({ isBot: false });
  });
});
