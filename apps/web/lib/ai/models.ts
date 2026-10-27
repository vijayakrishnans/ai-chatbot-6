// WHERE THE MODELS COME FROM. Upstream sends every model call through the
// Vercel AI Gateway, which needs a key nobody brokers. Here the default is
// Workers AI, through the Worker's own `AI` binding (wrangler.jsonc): it needs
// no key, so a fresh deployment chats with nothing configured. The gateway's
// models — upstream's list, unchanged — are offered only when
// AI_GATEWAY_API_KEY is set (a Worker secret), and the picker shows exactly
// what is available (`getAvailableModels`), never a model that would fail.
export const DEFAULT_CHAT_MODEL = "@cf/moonshotai/kimi-k2.6";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  // `workers-ai`: the AI binding; `gateway`: the AI Gateway (needs its key).
  via?: "workers-ai" | "gateway";
  // Workers AI models' capabilities are known here; the gateway's are looked
  // up from the gateway (getCapabilities).
  capabilities?: ModelCapabilities;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

// Current Workers AI text models with tool calling (OpenAI-compatible chat
// completions on the binding), run through `workers-ai-provider`.
export const workersAiModels: ChatModel[] = [
  {
    capabilities: { reasoning: true, tools: true, vision: true },
    description: "Moonshot AI's Kimi on Workers AI — tools, vision, reasoning",
    id: "@cf/moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    provider: "moonshotai",
    via: "workers-ai",
  },
  {
    capabilities: { reasoning: true, tools: true, vision: false },
    description: "Fast GLM on Workers AI — tools, reasoning",
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM 4.7 Flash",
    provider: "zai",
    via: "workers-ai",
  },
];

// Titles: the fast Workers AI model, its thinking turned off
// (app/(chat)/actions.ts).
export const titleModel: ChatModel = {
  description: "Fast model for title generation",
  id: "@cf/zai-org/glm-4.7-flash",
  name: "GLM 4.7 Flash",
  provider: "zai",
  via: "workers-ai",
};

// Upstream's curated gateway models, as upstream lists them. Offered only
// with AI_GATEWAY_API_KEY set.
export const gatewayModels: ChatModel[] = [
  {
    description: "Fast and capable model with tool use",
    gatewayOrder: ["bedrock", "deepinfra"],
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    via: "gateway",
  },
  {
    description: "Moonshot AI flagship model",
    gatewayOrder: ["fireworks", "bedrock"],
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "moonshotai",
    via: "gateway",
  },
  {
    description: "Compact reasoning model",
    gatewayOrder: ["groq", "bedrock"],
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    provider: "openai",
    reasoningEffort: "low",
    via: "gateway",
  },
  {
    description: "Open-source 120B parameter model",
    gatewayOrder: ["fireworks", "bedrock"],
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "openai",
    reasoningEffort: "low",
    via: "gateway",
  },
  {
    description: "Fast non-reasoning model with tool use",
    gatewayOrder: ["xai"],
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast",
    provider: "xai",
    via: "gateway",
  },
];

// Every model this app knows, in picker order.
export const chatModels: ChatModel[] = [...workersAiModels, ...gatewayModels];

// Whether the AI Gateway is configured. OpenNext copies the Worker's
// secrets and vars into process.env per request, so this is read at call
// time, never at module load.
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

// What a request may use: Workers AI always (the binding is in the committed
// wrangler config), the gateway's models only with its key.
export function getAvailableModels(): ChatModel[] {
  return isGatewayConfigured() ? chatModels : workersAiModels;
}

export function isAvailableModel(modelId: string): boolean {
  return getAvailableModels().some((m) => m.id === modelId);
}

export function isWorkersAiModel(modelId: string): boolean {
  return workersAiModels.some((m) => m.id === modelId);
}

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  const results = await Promise.all(
    getAvailableModels().map(async (model) => {
      if (model.capabilities) {
        return [model.id, model.capabilities];
      }
      try {
        const res = await fetch(
          `https://ai-gateway.vercel.sh/v1/models/${model.id}/endpoints`,
          { next: { revalidate: 86_400 } }
        );
        if (!res.ok) {
          return [model.id, { reasoning: false, tools: false, vision: false }];
        }

        const json = await res.json();
        const endpoints = json.data?.endpoints ?? [];
        const params = new Set(
          endpoints.flatMap(
            (e: { supported_parameters?: string[] }) =>
              e.supported_parameters ?? []
          )
        );
        const inputModalities = new Set(
          json.data?.architecture?.input_modalities ?? []
        );

        return [
          model.id,
          {
            reasoning: params.has("reasoning"),
            tools: params.has("tools"),
            vision: inputModalities.has("image"),
          },
        ];
      } catch {
        return [model.id, { reasoning: false, tools: false, vision: false }];
      }
    })
  );

  return Object.fromEntries(results);
}

export const isDemo = process.env.IS_DEMO === "1";

type GatewayModel = {
  id: string;
  name: string;
  type?: string;
  tags?: string[];
};

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    return (json.data ?? [])
      .filter((m: GatewayModel) => m.type === "language")
      .map((m: GatewayModel) => ({
        capabilities: {
          reasoning: m.tags?.includes("reasoning") ?? false,
          tools: m.tags?.includes("tool-use") ?? false,
          vision: m.tags?.includes("vision") ?? false,
        },
        description: "",
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
      }));
  } catch {
    return [];
  }
}

export function getActiveModels(): ChatModel[] {
  return getAvailableModels();
}

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);

export type ModelAvailability = "healthy" | "impacted" | "unknown";

type GatewayEndpoint = {
  provider_name?: string;
  status?: number;
  uptime_last_15m?: number;
  uptime_last_1h?: number;
  latency_last_1h?: {
    p50?: number;
    p95?: number;
  };
};

const PROVIDER_IMPACTED_UPTIME_THRESHOLD = 99;
const PROVIDER_IMPACTED_P50_MS = 10_000;
const PROVIDER_IMPACTED_P95_MS = 30_000;

function isEndpointImpacted(endpoint: GatewayEndpoint) {
  return (
    (endpoint.status !== undefined && endpoint.status !== 0) ||
    (endpoint.uptime_last_15m !== undefined &&
      endpoint.uptime_last_15m < PROVIDER_IMPACTED_UPTIME_THRESHOLD) ||
    (endpoint.uptime_last_1h !== undefined &&
      endpoint.uptime_last_1h < PROVIDER_IMPACTED_UPTIME_THRESHOLD) ||
    (endpoint.latency_last_1h?.p50 !== undefined &&
      endpoint.latency_last_1h.p50 > PROVIDER_IMPACTED_P50_MS) ||
    (endpoint.latency_last_1h?.p95 !== undefined &&
      endpoint.latency_last_1h.p95 > PROVIDER_IMPACTED_P95_MS)
  );
}

export async function getModelAvailability(
  modelId: string
): Promise<ModelAvailability> {
  const model = chatModels.find((item) => item.id === modelId);

  // Workers AI reports no per-model health the way the gateway does.
  if (!model || model.via === "workers-ai") {
    return "unknown";
  }

  try {
    const res = await fetch(
      `https://ai-gateway.vercel.sh/v1/models/${model.id}/endpoints`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      return "unknown";
    }

    const json = await res.json();
    const endpoints = (json.data?.endpoints ?? []) as GatewayEndpoint[];

    if (endpoints.length === 0) {
      return "unknown";
    }

    return endpoints.some(isEndpointImpacted) ? "impacted" : "healthy";
  } catch {
    return "unknown";
  }
}
