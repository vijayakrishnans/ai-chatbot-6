import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// apps/web's wrangler.jsonc is COMMITTED: the composition checks that it
// exists before the build, in a fresh checkout, so it cannot be a file a build
// generates. It is the render of wrangler.template.jsonc from
// wiring.fixture.json, and every lane re-renders it (apps/web/component.yaml's
// buildCommand): stage and prod from their live wiring documents, dev from
// the fixture. These hold the committed file to the template, and the live
// render to the documents it is given.
const app = path.resolve(__dirname, "../../../apps/web");
const wire = path.resolve(__dirname, "../../../tooling/wire");
const tmp = () => mkdtempSync(path.join(tmpdir(), "wire-"));

function renderFixture(env: string): string {
  const dir = tmp();
  try {
    const out = path.join(dir, "wrangler.jsonc");
    execFileSync(process.execPath, [
      path.join(wire, "render.mjs"),
      "--template",
      path.join(app, "wrangler.template.jsonc"),
      "--out",
      out,
      "--map",
      path.join(app, "wiring.fixture.json"),
      "--env",
      env,
    ]);
    return readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function renderLive(env: string, wiring: Record<string, string>, fixture = false): string {
  const dir = tmp();
  try {
    const out = path.join(dir, "wrangler.jsonc");
    const clean = { ...process.env };
    for (const k of Object.keys(clean)) {
      if (k.startsWith("WIRING_")) {
        delete clean[k];
      }
    }
    execFileSync(
      process.execPath,
      [
        path.join(wire, "live.mjs"),
        "--template",
        path.join(app, "wrangler.template.jsonc"),
        "--out",
        out,
        "--components",
        "cloudflare-hyperdrive,cloudflare-r2",
        "--env",
        env,
        ...(fixture ? ["--fixture", path.join(app, "wiring.fixture.json"), "--fixture-envs", "dev"] : []),
      ],
      { env: { ...clean, ...wiring }, stdio: "pipe" }
    );
    return readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

describe("apps/web wrangler config", () => {
  it("is committed as the fixture render of the template (pnpm run wire:fixture)", () => {
    expect(readFileSync(path.join(app, "wrangler.jsonc"), "utf8")).toBe(renderFixture("stage"));
  });

  it("binds Workers AI, Hyperdrive and R2 — and no model key", () => {
    const committed = readFileSync(path.join(app, "wrangler.jsonc"), "utf8");
    expect(committed).toMatch(/"ai":\s*\{\s*"binding":\s*"AI"\s*\}/);
    expect(committed).toMatch(/"binding":\s*"HYPERDRIVE"/);
    expect(committed).toMatch(/"binding":\s*"BLOB"/);
    expect(committed).not.toMatch(/"vars"/);
    expect(committed).not.toMatch(/AI_GATEWAY_API_KEY"\s*:/);
  });

  it("keeps every resource id and bucket in the template a wiring token", () => {
    const template = readFileSync(path.join(app, "wrangler.template.jsonc"), "utf8");
    expect(template).not.toMatch(/"id":\s*"[0-9a-f]{32}"/);
    expect(template).toMatch(/@@wiring\(cloudflare-hyperdrive\/__ENV__:hyperdrive_id\)@@/);
    expect(template).toMatch(/@@wiring\(cloudflare-r2\/__ENV__:r2_bucket_name\)@@/);
  });

  it("renders a deploy lane its own environment from the live wiring documents", () => {
    const rendered = renderLive("prod", {
      WIRING_CLOUDFLARE_HYPERDRIVE_PROD: JSON.stringify({ hyperdrive_id: "f".repeat(32), hyperdrive_name: "prod-x-prod" }),
      WIRING_CLOUDFLARE_R2_PROD: JSON.stringify({ r2_bucket_name: "prod-x-prod-bucket" }),
    });
    expect(rendered).toContain(`"id": "${"f".repeat(32)}"`);
    expect(rendered).toContain('"bucket_name": "prod-x-prod-bucket"');
    expect(rendered).not.toContain("__ENV__");
  });

  it("refuses a deploy render missing either wiring document", () => {
    expect(() =>
      renderLive("stage", {
        WIRING_CLOUDFLARE_HYPERDRIVE_STAGE: JSON.stringify({ hyperdrive_id: "e".repeat(32), hyperdrive_name: "x" }),
      })
    ).toThrow();
  });

  it("renders dev — which no root applies to — from the fixture, as the build command does", () => {
    const rendered = renderLive("dev", {}, true);
    expect(rendered).toContain('"id": "00000000000000000000000000000002"');
    expect(rendered).toContain('"bucket_name": "dev-ai-chatbot-6-dev"');
  });

  it("is what the component builds with: the live render, fixture for dev only", () => {
    const component = readFileSync(path.join(app, "component.yaml"), "utf8");
    expect(component).toContain("wranglerConfig: wrangler.jsonc");
    expect(component).toMatch(
      /buildCommand: node \.\.\/\.\.\/tooling\/wire\/live\.mjs --template wrangler\.template\.jsonc --out wrangler\.jsonc --components cloudflare-hyperdrive,cloudflare-r2 --env "\$\{ORUN_ENVIRONMENT\}" --fixture wiring\.fixture\.json --fixture-envs dev && /
    );
  });
});
