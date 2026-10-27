import { beforeEach, describe, expect, it, vi } from "vitest";

// The @vercel/functions stand-in (lib/geo.ts): `geolocation` reads the
// request's `cf` object — on the raw Worker request, else through the
// Cloudflare context — and `ipAddress` the cf-connecting-ip header.

const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContext(...args),
}));

describe("geolocation (lib/geo.ts)", () => {
  beforeEach(() => {
    getCloudflareContext.mockReset();
  });

  it("maps the Cloudflare context's cf properties to @vercel/functions' Geo", async () => {
    getCloudflareContext.mockReturnValue({
      cf: {
        city: "Lisbon",
        colo: "LIS",
        country: "PT",
        latitude: "38.72",
        longitude: "-9.14",
        postalCode: "1000",
        regionCode: "11",
      },
    });
    const { geolocation } = await import("@/lib/geo");
    expect(geolocation(new Request("https://app.example.com/api/chat"))).toEqual({
      city: "Lisbon",
      country: "PT",
      countryRegion: "11",
      flag: "🇵🇹",
      latitude: "38.72",
      longitude: "-9.14",
      postalCode: "1000",
      region: "LIS",
    });
  });

  it("prefers the request's own cf object when present", async () => {
    getCloudflareContext.mockReturnValue({ cf: { city: "Context" } });
    const { geolocation } = await import("@/lib/geo");
    const request = Object.assign(new Request("https://app.example.com/"), {
      cf: { city: "Request", country: "DE" },
    });
    expect(geolocation(request).city).toBe("Request");
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it("returns an empty Geo outside a Cloudflare context (next dev without bindings, scripts)", async () => {
    getCloudflareContext.mockImplementation(() => {
      throw new Error("no context");
    });
    const { geolocation } = await import("@/lib/geo");
    const geo = geolocation(new Request("https://app.example.com/"));
    expect(geo.city).toBeUndefined();
    expect(geo.latitude).toBeUndefined();
    expect(geo.flag).toBeUndefined();
  });
});

describe("ipAddress (lib/geo.ts)", () => {
  it("reads cf-connecting-ip first, then the x-real-ip / x-forwarded-for fallbacks", async () => {
    const { ipAddress } = await import("@/lib/geo");
    const at = (headers: Record<string, string>) =>
      ipAddress(new Request("https://app.example.com/", { headers }));
    expect(at({ "cf-connecting-ip": "203.0.113.7", "x-real-ip": "10.0.0.1" })).toBe("203.0.113.7");
    expect(at({ "x-real-ip": "10.0.0.1" })).toBe("10.0.0.1");
    expect(at({ "x-forwarded-for": "198.51.100.2, 10.0.0.9" })).toBe("198.51.100.2");
    expect(at({})).toBeUndefined();
  });
});
