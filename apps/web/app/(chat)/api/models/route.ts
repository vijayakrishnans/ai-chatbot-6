import {
  getAllGatewayModels,
  getAvailableModels,
  getCapabilities,
  isDemo,
  isGatewayConfigured,
} from "@/lib/ai/models";

// What the model picker shows: `available` is exactly what this deployment
// can run — the Workers AI models always, the AI Gateway's only when its key
// is set — and `capabilities` says what each supports. In the demo mode
// upstream ships (IS_DEMO=1, with a gateway key), `models` adds the
// gateway's whole catalogue, shown locked.
export async function GET() {
  const headers = {
    // Per deployment, and it changes when a key is set: short-lived.
    "Cache-Control": "public, max-age=300, s-maxage=300",
  };

  const available = getAvailableModels();
  const curatedCapabilities = await getCapabilities();

  if (isDemo && isGatewayConfigured()) {
    const models = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      models.map((m) => [m.id, curatedCapabilities[m.id] ?? m.capabilities])
    );

    return Response.json(
      {
        available,
        capabilities: { ...capabilities, ...curatedCapabilities },
        models,
      },
      { headers }
    );
  }

  return Response.json(
    { available, capabilities: curatedCapabilities },
    { headers }
  );
}
