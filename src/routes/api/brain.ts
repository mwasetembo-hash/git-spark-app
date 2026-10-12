import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { FOREX_KEYS, PROVIDERS, type ProviderId } from "@/lib/brain-providers";

const SYSTEM = `You are an expert multi-strategy market analyst for short-term Deriv contracts.
Analyze every angle: trend structure, momentum, volatility regime, smart-money concepts (FVG, order blocks, liquidity sweeps), classical chart and candlestick patterns, support/resistance, mean reversion vs breakout, and digit distribution for digit contracts. Use the analysis style appropriate for the market type (forex macro context, synthetic index pure price-action/statistics, crypto momentum, metals safe-haven flows).
Reply in this exact format:
SIGNAL: <SIDE_A|SIDE_B|WAIT>
CONFIDENCE: <0-100>
Then 4-8 short bullet points of reasoning, ending with the main risk. Be honest: say WAIT when there is no edge.`;

type Body = { snapshot?: unknown; provider?: ProviderId | "auto"; keys?: Record<string, string>; models?: Record<string, string> };

async function forexContext(pair: string, keys: Record<string, string>) {
  const k = (n: string) => process.env[n] || keys[n];
  const base = pair.slice(0, 3), quote = pair.slice(3, 6);
  const tries: [string, () => Promise<string | null>][] = [
    ["TWELVE_DATA_KEY", async () => { const r = await fetch(`https://api.twelvedata.com/quote?symbol=${base}/${quote}&apikey=${k("TWELVE_DATA_KEY")}`); const j: any = await r.json(); return j.close ? `TwelveData daily: open ${j.open} high ${j.high} low ${j.low} close ${j.close} change ${j.percent_change}%` : null; }],
    ["ALPHA_VANTAGE_KEY", async () => { const r = await fetch(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${k("ALPHA_VANTAGE_KEY")}`); const j: any = await r.json(); const x = j["Realtime Currency Exchange Rate"]; return x ? `AlphaVantage rate ${x["5. Exchange Rate"]} bid ${x["8. Bid Price"]} ask ${x["9. Ask Price"]}` : null; }],
    ["FCS_API_KEY", async () => { const r = await fetch(`https://fcsapi.com/api-v3/forex/latest?symbol=${base}/${quote}&access_key=${k("FCS_API_KEY")}`); const j: any = await r.json(); const x = j.response?.[0]; return x ? `FCS: open ${x.o} high ${x.h} low ${x.l} close ${x.c} change ${x.cp}` : null; }],
    ["EXCHANGE_RATE_KEY", async () => { const r = await fetch(`https://v6.exchangerate-api.com/v6/${k("EXCHANGE_RATE_KEY")}/pair/${base}/${quote}`); const j: any = await r.json(); return j.conversion_rate ? `ExchangeRate-API reference rate ${j.conversion_rate}` : null; }],
  ];
  for (const [name, fn] of tries) {
    if (!k(name)) continue;
    try { const v = await fn(); if (v) return v; } catch {}
  }
  return null;
}

export const Route = createFileRoute("/api/brain")({
  server: {
    handlers: {
      GET: async () => {
        const configured: Record<string, boolean> = {};
        for (const p of PROVIDERS) configured[p.id] = !!process.env[p.env];
        for (const f of FOREX_KEYS) configured[f] = !!process.env[f];
        return Response.json({ configured });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body?.snapshot) return new Response("Missing market snapshot.", { status: 400 });
        const keys = body.keys ?? {};
        const snap = body.snapshot as Record<string, unknown>;
        let prompt = JSON.stringify(snap).slice(0, 14000);
        const sym = String(snap["symbol"] ?? "");
        if (sym.startsWith("frx")) {
          const fx = await forexContext(sym.slice(3), keys);
          if (fx) prompt += `\nExternal forex data: ${fx}`;
        }

        const order = body.provider && body.provider !== "auto" ? PROVIDERS.filter((p) => p.id === body.provider) : PROVIDERS;
        const errors: string[] = [];
        for (const p of order) {
          const key = process.env[p.env] || keys[p.env];
          if (!key) { if (body.provider === p.id) errors.push(`${p.label}: no key configured`); continue; }
          const model = body.models?.[p.id] || p.model;
          try {
            let text: string;
            if (p.id === "lovable") {
              const provider = createOpenAI({ baseURL: p.baseURL, apiKey: key, headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
              const r = streamText({
                model: provider.responses(model), system: SYSTEM, prompt, abortSignal: request.signal, maxRetries: 1,
                providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
              });
              text = await r.text;
            } else {
              const provider = createOpenAI({ baseURL: p.baseURL, apiKey: key });
              const r = streamText({ model: provider.chat(model), system: SYSTEM, prompt, abortSignal: request.signal, maxRetries: 1 });
              text = await r.text;
            }
            if (!text.trim()) throw new Error("empty reply");
            return Response.json({ provider: p.label, text });
          } catch (e: any) {
            errors.push(`${p.label}: ${String(e?.message ?? e).slice(0, 200)}`);
          }
        }
        return Response.json({ error: errors.length ? errors.join("\n") : "No AI provider has a key. Add one in the Brain settings." }, { status: 502 });
      },
    },
  },
});
