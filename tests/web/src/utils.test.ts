import { describe, expect, it } from "vitest";
import {
  cn,
  convertToUIMessages,
  generateUUID,
  getDocumentTimestampByIndex,
  getTextFromMessage,
  sanitizeText,
} from "@/lib/utils";

// The template's pure helpers (lib/utils.ts), untouched by the port.

describe("cn", () => {
  it("merges class names and lets the last tailwind utility win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("generateUUID", () => {
  it("produces RFC 4122 v4-shaped ids", () => {
    const id = generateUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(generateUUID()).not.toBe(id);
  });
});

describe("getTextFromMessage", () => {
  it("joins the text parts and skips the rest", () => {
    const text = getTextFromMessage({
      id: "m1",
      parts: [
        { text: "Hello ", type: "text" },
        { mediaType: "image/png", type: "file", url: "https://x/y.png" },
        { text: "world", type: "text" },
      ],
      role: "user",
    });
    expect(text).toBe("Hello world");
  });
});

describe("convertToUIMessages", () => {
  it("maps database rows to UI messages with an ISO createdAt", () => {
    const createdAt = new Date("2026-10-15T12:00:00.000Z");
    const [ui] = convertToUIMessages([
      {
        attachments: [],
        chatId: "c1",
        createdAt,
        id: "m1",
        parts: [{ text: "hi", type: "text" }],
        role: "user",
      },
    ]);
    expect(ui.id).toBe("m1");
    expect(ui.role).toBe("user");
    expect(ui.parts).toEqual([{ text: "hi", type: "text" }]);
    expect(ui.metadata?.createdAt).toMatch(/^2026-10-15T/);
  });
});

describe("sanitizeText / getDocumentTimestampByIndex", () => {
  it("strips the function-call marker", () => {
    expect(sanitizeText("a<has_function_call>b")).toBe("ab");
  });

  it("returns the document's createdAt by index and now when out of range", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const documents = [
      { content: "", createdAt, id: "d", kind: "text" as const, title: "t", userId: "u" },
    ];
    expect(getDocumentTimestampByIndex(documents, 0)).toBe(createdAt);
    expect(getDocumentTimestampByIndex(documents, 5).getTime()).toBeGreaterThan(createdAt.getTime());
  });
});
