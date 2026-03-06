import {
  looksLikeInjection,
  looksLikeMalware,
  looksLikeCyberAttack,
  looksLikeDataExfiltration
} from "./helpers/detectors.mjs";

import { INSTRUCTION_PROMPT } from "./prompts/instruction.mjs";

// Keep last 100 analyses in memory (temporary)
let history = [];

// ---------- Heuristic fallback ----------
function fallbackClassification(prompt, raw) {
  const categories = [];
  let risk = "low";
  let allowed = true;

  if (looksLikeInjection(prompt)) {
    risk = "high";
    allowed = false;
    categories.push("prompt_injection");
  }

  if (looksLikeMalware(prompt)) {
    risk = "high";
    allowed = false;
    categories.push("malicious_code", "illegal_activity");
  }

  if (looksLikeCyberAttack(prompt)) {
    risk = "high";
    allowed = false;
    categories.push("cyber_attack_enablement", "illegal_activity");
  }

  if (looksLikeDataExfiltration(prompt)) {
    risk = "high";
    allowed = false;
    categories.push("data_exfiltration_attempt", "sensitive_data_request");
  }

  if (categories.length === 0) {
    risk = "low";
    allowed = true;
    categories.push("none");
  }

  let reason;
  if (risk === "high") {
    if (categories.includes("malicious_code") || categories.includes("illegal_activity")) {
      reason =
        "User prompt requests or implies creation of malware, exploits, or other illegal or abusive behavior.";
    } else if (categories.includes("prompt_injection")) {
      reason = "User prompt attempts to override existing instructions or manipulate the model's behavior.";
    } else if (categories.includes("data_exfiltration_attempt")) {
      reason = "User prompt attempts to access or extract sensitive or private data.";
    } else {
      reason = "User prompt contains high-risk content that may lead to unsafe or disallowed behavior.";
    }
  } else {
    reason = "No obvious safety issues were detected in the user prompt.";
  }

  const recommendations = allowed
    ? ["You can safely forward this prompt to the downstream model."]
    : [
        "Do not forward this prompt to downstream models.",
        "Log this event for further analysis."
      ];

  return {
    risk_level: risk,
    categories,
    allowed,
    sanitized_prompt: allowed ? prompt : null,
    reason,
    recommendations
    // _raw_response: raw // keep for debugging
  };
}

// ---------- Helper: call Workers AI via env.AI ----------
async function analyzePromptWithAI(prompt, env) {
  const systemPrompt = INSTRUCTION_PROMPT;
  const modelId = env.MODEL_ID || "@cf/meta/llama-3.2-3b-instruct";

  let raw = "";
  let parsedFromModel = null;

  // Helper: try to loosely parse JSON from a string
  function tryLooseJsonParse(str) {
    if (!str) return null;
    let s = str.trim();

    // Strip markdown fences like ```json ... ```
    if (s.startsWith("```")) {
      // remove first line (``` or ```json)
      const lines = s.split("\n");
      if (lines.length >= 2) {
        // drop first and last line if they look like fences
        const first = lines[0].trim().toLowerCase();
        const last = lines[lines.length - 1].trim();
        let bodyLines = lines.slice(1);
        if (last.startsWith("```")) {
          bodyLines = lines.slice(1, -1);
        }
        s = bodyLines.join("\n").trim();
      }
    }

    // Try direct parse first
    try {
      return JSON.parse(s);
    } catch {
      // Try to extract first { ... } block
      const firstBrace = s.indexOf("{");
      const lastBrace = s.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = s.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // ignore
        }
      }
    }

    return null;
  }

  // Internal helper: call model, optionally using json_schema
  async function callModel(useJsonSchema) {
    const basePayload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      top_p: 0.9
    };

    const payload = useJsonSchema
      ? {
          ...basePayload,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "classification",
              schema: {
                type: "object",
                properties: {
                  risk_level: { type: "string" },
                  categories: {
                    type: "array",
                    items: { type: "string" }
                  },
                  allowed: { type: "boolean" },
                  sanitized_prompt: { type: ["string", "null"] },
                  reason: { type: "string" },
                  recommendations: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: [
                  "risk_level",
                  "categories",
                  "allowed",
                  "sanitized_prompt",
                  "reason",
                  "recommendations"
                ],
                additionalProperties: false
              }
            }
          }
        }
      : basePayload;

    return env.AI.run(modelId, payload);
  }

  try {
    let result;

    // Try with JSON Schema first
    try {
      result = await callModel(true);
    } catch (err) {
      const msg = err?.message || String(err);

      // If the model doesn't support JSON Schema, retry without it
      if (msg.includes("5025") || msg.toLowerCase().includes("doesn't support json schema")) {
        result = await callModel(false);
      } else {
        throw err;
      }
    }

    // ---- Normalize result shape ----
    if (typeof result === "string") {
      raw = result;
    } else if (typeof result.response === "string") {
      raw = result.response;
    } else if (result.response && typeof result.response === "object") {
      // Some Workers AI models already give parsed JSON here
      parsedFromModel = result.response;
      raw = JSON.stringify(result.response);
    } else {
      raw = JSON.stringify(result);
    }

    // Try loose parsing of the raw string
    if (!parsedFromModel && raw) {
      parsedFromModel = tryLooseJsonParse(raw);
    }
  } catch (err) {
    return {
      risk_level: "unknown",
      categories: ["ai_runtime_error"],
      allowed: false,
      sanitized_prompt: null,
      reason: "env.AI.run failed: " + (err?.message || String(err)),
      recommendations: [
        'Verify [ai] binding = "AI" in wrangler.toml.',
        "Make sure MODEL_ID is a valid Workers AI model.",
        "Run with `wrangler dev --remote` so AI runs on edge."
      ],
      _raw_response: null
    };
  }

  // If model JSON is valid, use it as source of truth and only harden with heuristics if needed
  if (parsedFromModel && typeof parsedFromModel === "object") {
    const modelResult = parsedFromModel;
    const heuristic = fallbackClassification(prompt, raw);

    let merged = {
      ...modelResult,
      categories: Array.isArray(modelResult.categories)
        ? modelResult.categories.slice()
        : [],
      _source: "model"
    };

    if (heuristic.risk_level === "high" && modelResult.risk_level !== "high") {
      merged.risk_level = "high";
      merged.allowed = false;

      const set = new Set([...merged.categories, ...heuristic.categories]);
      merged.categories = Array.from(set);

      merged.reason = modelResult.reason || heuristic.reason;
      merged._source = "model+heuristic";
      merged._model_json = modelResult;
    }

    return merged;
  }

  // The model output couldn't be parsed, proceed to fallback
  const fallback = fallbackClassification(prompt, raw);
  return {
    ...fallback,
    _source: "fallback_parse_error"
  };
}

// ---------- Worker: routes ----------
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Serve UI
      if (url.pathname === "/") {
        const assetUrl = new URL("/ui.html", request.url);
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }

      // Analyze prompt and store in memory
      if (url.pathname === "/analyze" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const prompt = (body.prompt || "").toString();

        if (!prompt.trim()) {
          return new Response(
            JSON.stringify({ error: "Missing 'prompt' in request body." }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }

        // Call the classifier
        const analysisRaw = await analyzePromptWithAI(prompt, env);

        // Strip internal/debug fields before returning (so UI never sees fallback/parse info)
        const { _source, _raw_response, _model_json, ...analysis } = analysisRaw;

        const record = {
          id: `req_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          prompt,
          analysis, // only clean fields: risk_level, categories, allowed, etc.
          createdAt: new Date().toISOString()
        };

        history.unshift(record);
        history = history.slice(0, 100);

        return new Response(JSON.stringify(record), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      // Optional: expose last 100 analyses
      if (url.pathname === "/history" && request.method === "GET") {
        return new Response(JSON.stringify(history), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      const message = err?.message || String(err);
      const stack = err?.stack || "";
      return new Response(`Worker error:\n\n${message}\n\n${stack}`, {
        status: 500,
        headers: { "content-type": "text/plain" }
      });
    }
  }
};