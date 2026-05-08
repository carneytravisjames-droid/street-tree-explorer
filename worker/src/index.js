// Cloudflare Worker — proxies chat requests to the Anthropic API.
// Receives a natural-language question, asks Claude for a structured
// JSON filter the front-end can apply locally to the GeoJSON.

const SYSTEM_PROMPT = `You translate plain-English questions about Portland street trees into a JSON filter object.

The dataset has these fields:
- Genus (string, e.g. "Acer", "Quercus", "Prunus")
- Species (string, e.g. "rubrum", "platanoides")
- Common (string, e.g. "Red Maple", "Norway Maple")
- Condition (one of: "Good", "Fair", "Poor", "Dead")
- DBH (number, trunk diameter in inches)

Reply with ONLY a JSON object, no prose, of the form:
{
  "filter": { "genus"?: string, "species"?: string, "common"?: string, "condition"?: "Good"|"Fair"|"Poor"|"Dead", "dbh_min"?: number, "dbh_max"?: number },
  "summary": string  // one short sentence describing what was filtered, max 20 words
}

Omit any filter keys that don't apply. "mature" trees means dbh_min >= 18. "small" trees means dbh_max <= 8.
If the question can't be turned into a filter, return { "filter": {}, "summary": "<helpful message>" }.`;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "POST") return cors(new Response("Method not allowed", { status: 405 }));

    let body;
    try { body = await request.json(); } catch { return cors(new Response("Bad JSON", { status: 400 })); }
    const question = (body.question || "").toString().slice(0, 500);
    if (!question) return cors(new Response("Missing question", { status: 400 }));

    if (!env.ANTHROPIC_API_KEY) {
      return cors(json({ filter: {}, summary: "Server not configured: missing ANTHROPIC_API_KEY." }));
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return cors(json({ filter: {}, summary: `Anthropic API error (${resp.status}).` }, 502));
    }

    const data = await resp.json();
    const text = (data.content?.[0]?.text || "").trim();

    let parsed;
    try {
      // Strip code fences if the model wrapped its answer.
      const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return cors(json({ filter: {}, summary: "Couldn't parse the model's reply." }));
    }

    return cors(json(parsed));
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cors(res) {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type");
  return res;
}
