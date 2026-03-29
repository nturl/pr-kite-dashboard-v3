import { GoogleGenerativeAI } from "@google/generative-ai";
import { SpotWithWind } from "./spots";

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

// ── Wind condition label helpers ─────────────────────────────────────────
export function windLabel(kts: number | null): string {
  if (kts == null) return "No data";
  if (kts < 8)   return "Too light";
  if (kts < 12)  return "Light";
  if (kts < 16)  return "Moderate";
  if (kts < 20)  return "Good";
  if (kts < 25)  return "Strong";
  if (kts < 30)  return "Very strong";
  return "Extreme";
}

// ── Per-spot conditions analysis ─────────────────────────────────────────
export interface SpotVerdict {
  spotId:    string;
  verdict:   "go" | "marginal" | "no-go";
  emoji:     string;
  headline:  string;
  detail:    string;
  kiteSizes: string; // e.g. "12–14m"
}

export async function analyzeConditions(spots: SpotWithWind[]): Promise<SpotVerdict[]> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const liveSpots = spots.filter((s) => s.wind?.avg != null).slice(0, 12);
  if (!liveSpots.length) return [];

  const spotSummary = liveSpots.map((s) => ({
    id:        s.id,
    name:      s.name,
    region:    s.region,
    type:      s.type,
    avg:       s.wind?.avg,
    gust:      s.wind?.gust,
    direction: s.wind?.directionText,
  }));

  const prompt = `You are an expert kitesurfing coach analyzing Puerto Rico wind conditions.

Here are the current live wind readings (all in knots):
${JSON.stringify(spotSummary, null, 2)}

For EACH spot, return a JSON array with this exact shape:
[
  {
    "spotId": "<spot id>",
    "verdict": "go" | "marginal" | "no-go",
    "emoji": "🟢" | "🟡" | "🔴",
    "headline": "<10 words max — punchy assessment>",
    "detail": "<1 sentence with specific wind info and any hazards>",
    "kiteSizes": "<recommended range e.g. '12–14m' or 'N/A'>"
  }
]

Rules:
- "go" = 12–28 kts avg, steady direction
- "marginal" = 8–12 kts or 28–32 kts or gusty (gust > avg + 8)
- "no-go" = < 8 kts or > 32 kts
- kiteSizes: assume average adult rider (75kg). For offshore buoys/airports note "check nearby kite spot".
- Return ONLY the JSON array, no markdown, no extra text.`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text().trim();

  // Strip markdown code fences if model adds them
  const json = text.replace(/^```json?\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(json) as SpotVerdict[];
}

// ── Regional summary ─────────────────────────────────────────────────────
export interface RegionalSummary {
  region:  string;
  summary: string;
  bestSpot: string;
}

export async function getRegionalSummaries(spots: SpotWithWind[]): Promise<RegionalSummary[]> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const byRegion = spots.reduce<Record<string, SpotWithWind[]>>((acc, s) => {
    if (s.wind?.avg != null) {
      acc[s.region] = acc[s.region] || [];
      acc[s.region].push(s);
    }
    return acc;
  }, {});

  const regionData = Object.entries(byRegion).map(([region, rSpots]) => ({
    region,
    spots: rSpots.map((s) => ({ name: s.name, avg: s.wind?.avg, gust: s.wind?.gust, dir: s.wind?.directionText })),
  }));

  const prompt = `You are a Puerto Rico kitesurfing forecaster. Summarize conditions by region.

Data: ${JSON.stringify(regionData, null, 2)}

Return a JSON array:
[
  {
    "region": "<North|East|South|West>",
    "summary": "<2 sentences max — describe wind quality, best window, any trade pattern notes>",
    "bestSpot": "<name of best spot in this region right now>"
  }
]

Return ONLY the JSON array.`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text().trim();
  const json   = text.replace(/^```json?\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(json) as RegionalSummary[];
}

// ── Natural language chat ────────────────────────────────────────────────
export interface ChatMessage {
  role:    "user" | "model";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  spots:    SpotWithWind[],
  userProfile?: { heightCm: number; weightKg: number }
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const windContext = spots
    .filter((s) => s.wind?.avg != null)
    .map((s) => `${s.name} (${s.region}): ${s.wind?.avg}kts avg, ${s.wind?.gust ?? "?"}kts gust, ${s.wind?.directionText ?? "?"} direction`)
    .join("\n");

  const profileNote = userProfile
    ? `Rider profile: ${userProfile.heightCm}cm tall, ${userProfile.weightKg}kg.`
    : "";

  const systemContext = `You are a knowledgeable kitesurfing assistant for Puerto Rico.
You have real-time wind data for all spots around the island.
${profileNote}

Current conditions (${new Date().toLocaleTimeString("en-US", { timeZone: "America/Puerto_Rico" })} AST):
${windContext}

Be concise, specific, and conversational. Use kite sizes, spot names, and wind values from the data.
If asked about a kite size, factor in the rider profile if provided.`;

  const chatSession = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: systemContext }],
      },
      {
        role: "model",
        parts: [{ text: "Got it — I have the current PR conditions loaded. What would you like to know?" }],
      },
      ...messages.slice(0, -1).map((m) => ({
        role: m.role as "user" | "model",
        parts: [{ text: m.content }],
      })),
    ],
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chatSession.sendMessage(lastMessage.content);
  return result.response.text();
}

// ── Kite size recommendation ─────────────────────────────────────────────
export interface KiteRecommendation {
  recommended: string;   // e.g. "12m"
  range:       string;   // e.g. "10–14m"
  confidence:  "high" | "medium" | "low";
  reasoning:   string;
  safetyNote?: string;
}

export async function recommendKiteSize(
  heightCm:  number,
  weightKg:  number,
  windAvg:   number,
  windGust:  number | null,
  spotName:  string
): Promise<KiteRecommendation> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const prompt = `You are a certified kitesurfing instructor. Recommend a kite size.

Rider: ${heightCm}cm tall, ${weightKg}kg
Conditions at ${spotName}: ${windAvg}kts average${windGust ? `, ${windGust}kts gusts` : ""}
Assume flat/choppy water (Puerto Rico lagoon/beach conditions).
Assume intermediate rider skill level.

Return JSON only:
{
  "recommended": "<single kite size e.g. '12m'>",
  "range": "<safe range e.g. '10–14m'>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<2 sentences explaining the recommendation>",
  "safetyNote": "<optional safety warning if conditions are extreme or borderline>"
}`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text().trim();
  const json   = text.replace(/^```json?\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(json) as KiteRecommendation;
}
