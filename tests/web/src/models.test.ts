import { generateText, streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The model provider (lib/ai/models.ts, lib/ai/providers.ts). Workers AI,
// through the Worker's AI binding, is the default and needs no key; the AI
// Gateway's models are offered only with AI_GATEWAY_API_KEY. The binding is a
// stand-in here — it records what it was asked and answers the way Workers
// AI's binding does: a JSON body, or a server-sent-event stream when the
// inputs ask for `stream: true`.
const run = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { AI: { run } } }),
}));

function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ response: chunk })}\n\n`));
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

describe("the models a deployment offers (lib/ai/models.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AI_GATEWAY_API_KEY;
  });
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("offers only Workers AI with no gateway key, the default among them", async () => {
    const models = await import("@/lib/ai/models");
    const ids = models.getAvailableModels().map((m) => m.id);
    expect(ids.every((id) => id.startsWith("@cf/"))).toBe(true);
    expect(ids).toContain(models.DEFAULT_CHAT_MODEL);
    expect(models.isAvailableModel("moonshotai/kimi-k2.5")).toBe(false);
  });

  it("adds the gateway's models once its key is set", async () => {
    process.env.AI_GATEWAY_API_KEY = "a-key";
    const models = await import("@/lib/ai/models");
    const ids = models.getAvailableModels().map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["@cf/moonshotai/kimi-k2.6", "moonshotai/kimi-k2.5"]));
  });

  it("knows each Workers AI model's capabilities without a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const models = await import("@/lib/ai/models");
    const caps = await models.getCapabilities();
    expect(caps[models.DEFAULT_CHAT_MODEL]).toEqual({ reasoning: true, tools: true, vision: true });
    expect(Object.keys(caps).every((id) => id.startsWith("@cf/"))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("the provider (lib/ai/providers.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    run.mockReset();
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("answers a gateway model with no key by the default Workers AI model", async () => {
    const { resolveModelId } = await import("@/lib/ai/providers");
    const { DEFAULT_CHAT_MODEL } = await import("@/lib/ai/models");
    expect(resolveModelId("xai/grok-4.1-fast-non-reasoning")).toBe(DEFAULT_CHAT_MODEL);
    expect(resolveModelId("@cf/zai-org/glm-4.7-flash")).toBe("@cf/zai-org/glm-4.7-flash");
    process.env.AI_GATEWAY_API_KEY = "a-key";
    expect(resolveModelId("xai/grok-4.1-fast-non-reasoning")).toBe("xai/grok-4.1-fast-non-reasoning");
  });

  it("runs a chat model on the AI binding", async () => {
    run.mockResolvedValue({ response: "Hello from Workers AI" });
    const { getLanguageModel } = await import("@/lib/ai/providers");
    const { text } = await generateText({
      model: getLanguageModel("@cf/moonshotai/kimi-k2.6"),
      prompt: "hi",
    });
    expect(text).toBe("Hello from Workers AI");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toBe("@cf/moonshotai/kimi-k2.6");
  });

  it("streams a chat model's answer from the binding's event stream", async () => {
    run.mockResolvedValue(sse(["Streamed ", "through ", "the binding."]));
    const { getLanguageModel } = await import("@/lib/ai/providers");
    const result = streamText({
      model: getLanguageModel("@cf/moonshotai/kimi-k2.6"),
      prompt: "hi",
    });
    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
    }
    expect(text).toBe("Streamed through the binding.");
    expect(run.mock.calls[0]![1]).toMatchObject({ stream: true });
  });

  it("titles chats with the fast Workers AI model", async () => {
    run.mockResolvedValue({ response: "A title" });
    const { getTitleModel } = await import("@/lib/ai/providers");
    const { titleModel } = await import("@/lib/ai/models");
    await generateText({ model: getTitleModel(), prompt: "hi" });
    expect(run.mock.calls[0]![0]).toBe(titleModel.id);
  });
});
