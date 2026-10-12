// Browser-safe provider catalog shared by the Brain panel and server route.
export type ProviderId =
  | "lovable" | "grok" | "gemini" | "openai" | "cohere" | "deepseek"
  | "mistral" | "kimi" | "bigmodel" | "minimax" | "stepfun" | "qwen";

export const PROVIDERS: { id: ProviderId; label: string; env: string; baseURL: string; model: string }[] = [
  { id: "lovable", label: "Lovable AI (built in)", env: "LOVABLE_API_KEY", baseURL: "https://ai.gateway.lovable.dev/v1", model: "openai/gpt-6-astra" },
  { id: "grok", label: "Grok (xAI)", env: "GROK_API_KEY", baseURL: "https://api.x.ai/v1", model: "grok-4.20-fast" },
  { id: "gemini", label: "Gemini", env: "GEMINI_API_KEY", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.1-flash-lite-preview" },
  { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY", baseURL: "https://api.openai.com/v1", model: "gpt-5-mini" },
  { id: "cohere", label: "Cohere", env: "COHERE_API_KEY", baseURL: "https://api.cohere.ai/compatibility/v1", model: "command-a-03-2025" },
  { id: "deepseek", label: "DeepSeek", env: "DEEPSEEK_API_KEY", baseURL: "https://api.deepseek.com/v1", model: "DeepSeek-V4-Flash" },
  { id: "mistral", label: "Mistral", env: "MISTRAL_API_KEY", baseURL: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  { id: "kimi", label: "Kimi (Moonshot)", env: "KIMI_API_KEY", baseURL: "https://api.moonshot.ai/v1", model: "kimi-k2.6" },
  { id: "bigmodel", label: "BigModel (GLM)", env: "BIGMODEL_API_KEY", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.6" },
  { id: "minimax", label: "MiniMax", env: "MINIMAX_API_KEY", baseURL: "https://api.minimax.io/v1", model: "MiniMax-M2.1" },
  { id: "stepfun", label: "StepFun", env: "STEPFUN_API_KEY", baseURL: "https://api.stepfun.com/v1", model: "step-3.5-flash" },
  { id: "qwen", label: "Qwen (Alibaba)", env: "QWEN_API_KEY", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen3.6-27b" },
];

/** Your 15 requested models, grouped by the provider key they use. Pick or type any model name. */
export const MODEL_PRESETS: Partial<Record<ProviderId, string[]>> = {
  minimax: ["MiniMax-M2.1"],
  stepfun: ["step-3.5-flash", "stepfun-ai/step-3.5-flash"],
  deepseek: ["DeepSeek-V4-Flash"],
  gemini: ["gemini-3.1-flash-lite-preview"],
  kimi: ["kimi-k2.6", "moonshotai/kimi-k2.6", "kimi-k2.5"],
  openai: ["gpt-4o-mini", "gpt-5-mini"],
  grok: ["grok-4.20-fast", "grok-imagine-image-lite"],
  qwen: ["qwen3.6-27b", "Qwen3.6"],
  bigmodel: ["glm-4.6", "z-ai/glm-5.1", "openai/zai-org/GLM-4.7"],
};

export const FOREX_KEYS = ["TWELVE_DATA_KEY", "ALPHA_VANTAGE_KEY", "FCS_API_KEY", "EXCHANGE_RATE_KEY"] as const;

export type BrainVerdict = { side: 0 | 1 | null; confidence: number; text: string; provider: string };
