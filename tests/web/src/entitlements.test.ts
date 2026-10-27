import { describe, expect, it } from "vitest";
import { entitlementsByUserType } from "@/lib/ai/entitlements";

describe("entitlementsByUserType (lib/ai/entitlements.ts)", () => {
  it("caps guests and regular users at the template's hourly message limit", () => {
    expect(entitlementsByUserType.guest.maxMessagesPerHour).toBe(10);
    expect(entitlementsByUserType.regular.maxMessagesPerHour).toBe(10);
  });
});
