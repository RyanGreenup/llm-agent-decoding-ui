export interface OpenAIProviderConfig {
  id: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  defaultEmbeddingModel: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const hasOwnProperty = Object.prototype.hasOwnProperty;

function normalizeBaseUrl(value: string | undefined): string {
  const raw = (value ?? DEFAULT_BASE_URL).trim();
  const withoutTrailingSlash = raw.replace(/\/+$/, "");
  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : DEFAULT_BASE_URL;
}

const PROVIDERS = {
  openai: {
    id: "openai",
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL),
    apiKeyEnvVar: "OPENAI_API_KEY",
    defaultEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() ||
      DEFAULT_EMBEDDING_MODEL,
  },
} as const satisfies Record<string, OpenAIProviderConfig>;

function get(name: string): OpenAIProviderConfig {
  if (!hasOwnProperty.call(PROVIDERS, name)) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return PROVIDERS[name as keyof typeof PROVIDERS];
}

function authHeaders(name: string): Record<string, string> {
  const provider = get(name);
  const apiKey = process.env[provider.apiKeyEnvVar]?.trim();
  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${name}". Set ${provider.apiKeyEnvVar}.`,
    );
  }
  return { Authorization: `Bearer ${apiKey}` };
}

export const Providers = {
  get,
  authHeaders,
} as const;
