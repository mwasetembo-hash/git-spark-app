// Browser-safe provider catalog shared by the Brain panel and server route.
export type ProviderId =
  | "lovable" | "grok" | "gemini" | "openai" | "cohere" | "deepseek"
  | "mistral" | "kimi" | "bigmodel" | "minimax" | "stepfun";

export const PROVIDERS: { id: ProviderId; label: string; env: string; baseURL: string; model: string }[] = [
  { id: "lovable", label: "Lovable AI (built in)", env: "LOVABLE_API_KEY", baseURL: "https://ai.gateway.lovable.dev/v1", model: "openai/gpt-6-astra" },
  { id: "grok", label: "Grok (xAI)", env: "GROK_API_KEY", baseURL: "https://api.x.ai/v1", model: "grok-4-fast" },
  { id: "gemini", label: "Gemini", env: "GEMINI_API_KEY", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY", baseURL: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  { id: "cohere", label: "Cohere", env: "COHERE_API_KEY", baseURL: "https://api.cohere.ai/compatibility/v1", model: "command-a-03-2025" },
  { id: "deepseek", label: "DeepSeek", env: "DEEPSEEK_API_KEY", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "mistral", label: "Mistral", env: "MISTRAL_API_KEY", baseURL: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  { id: "kimi", label: "Kimi (Moonshot)", env: "KIMI_API_KEY", baseURL: "https://api.moonshot.ai/v1", model: "kimi-k2-0905-preview" },
  { id: "bigmodel", label: "BigModel (GLM)", env: "BIGMODEL_API_KEY", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "minimax", label: "MiniMax", env: "MINIMAX_API_KEY", baseURL: "https://api.minimax.io/v1", model: "MiniMax-M1" },
  { id: "stepfun", label: "StepFun", env: "STEPFUN_API_KEY", baseURL: "https://api.stepfun.com/v1", model: "step-1-8k" },
];

export const FOREX_KEYS = ["TWELVE_DATA_KEY", "ALPHA_VANTAGE_KEY", "FCS_API_KEY", "EXCHANGE_RATE_KEY"] as const;

export type BrainVerdict = { side: 0 | 1 | null; confidence: number; text: string; provider: string };
