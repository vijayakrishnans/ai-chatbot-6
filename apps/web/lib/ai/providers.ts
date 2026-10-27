import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customProvider, gateway, type LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { isTestEnvironment } from "../constants";
import {
  DEFAULT_CHAT_MODEL,
  isAvailableModel,
  isWorkersAiModel,
  titleModel,
} from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        titleModel: mockTitleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mockTitleModel,
        },
      });
    })()
  : null;

// Workers AI through the Worker's own `AI` binding (wrangler.jsonc). No key:
// the binding is the credential. Read per call — the binding lives on the
// request's Cloudflare context, not at module scope.
function workersAi() {
  const { env } = getCloudflareContext();
  if (!env.AI) {
    throw new Error(
      'The AI binding is missing: wrangler.jsonc must declare `"ai": { "binding": "AI" }`'
    );
  }
  return createWorkersAI({ binding: env.AI });
}

// A model id the request may not use — a gateway model with no gateway key,
// or one nobody lists — falls back to the default Workers AI model rather
// than failing the chat (lib/ai/models.ts, getAvailableModels).
export function resolveModelId(modelId: string): string {
  return isAvailableModel(modelId) ? modelId : DEFAULT_CHAT_MODEL;
}

export function getLanguageModel(modelId: string): LanguageModel {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const id = resolveModelId(modelId);
  if (isWorkersAiModel(id)) {
    return workersAi()(id);
  }
  return gateway.languageModel(id);
}

export function getTitleModel(): LanguageModel {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return workersAi()(titleModel.id);
}
