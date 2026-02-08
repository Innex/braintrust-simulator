import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { PRESET_PERSONAS } from "@/lib/personas";

const extractionResultSchema = z.object({
  goal: z.string(),
  successCriteria: z.string(),
  personalityType: z.string(),
  communicationStyle: z.string(),
  additionalContext: z.string().optional(),
});

const PERSONALITY_TO_PRESET: Record<string, string> = {
  direct: "direct",
  efficient: "direct",
  impatient: "frustrated",
  frustrated: "frustrated",
  angry: "frustrated",
  exploratory: "exploratory",
  curious: "exploratory",
  friendly: "friendly",
  warm: "friendly",
  polite: "friendly",
  confused: "confused",
  uncertain: "confused",
};

function mapPersonalityToPreset(personalityType: string): string {
  const normalized = personalityType.toLowerCase().trim();
  for (const [keyword, presetId] of Object.entries(PERSONALITY_TO_PRESET)) {
    if (normalized.includes(keyword)) {
      return presetId;
    }
  }
  return "direct";
}

export async function POST(request: NextRequest) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY environment variable is not set" },
      { status: 500 }
    );
  }

  let body: { rows: Array<{ id: string; messages: Array<{ role: string; content: string }> }> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return Response.json(
      { error: "Request must include a non-empty rows array" },
      { status: 400 }
    );
  }

  const client = new OpenAI({ apiKey: openaiApiKey });

  const extractionPromises = body.rows.map(async (row) => {
    const userMessages = row.messages.filter((m) => m.role === "user");
    const firstUserMessage = userMessages[0]?.content ?? "";
    const conversationText = row.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    try {
      const response = await client.responses.create({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: `You extract user profiles from customer service conversations. Analyze the conversation and extract a structured profile as JSON.

Return ONLY valid JSON with these fields:
- goal: What the user was trying to accomplish (1-2 sentences)
- successCriteria: How to determine if the goal was achieved (1-2 sentences)
- personalityType: One of: direct, exploratory, frustrated, friendly, confused
- communicationStyle: Brief description of how the user communicates
- additionalContext: Any relevant context about the user's situation (optional)`,
          },
          {
            role: "user",
            content: `First user message: "${firstUserMessage}"

Full conversation:
${conversationText}

Extract the user profile as JSON.`,
          },
        ],
      });

      const outputText =
        typeof response.output_text === "string"
          ? response.output_text
          : "";

      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = extractionResultSchema.safeParse(parsed);
      if (!validated.success) {
        return null;
      }

      const result = validated.data;
      const presetId = mapPersonalityToPreset(result.personalityType);
      const presetPersona = PRESET_PERSONAS.find((p) => p.id === presetId);

      const persona = presetPersona
        ? { ...presetPersona }
        : {
            id: `extracted-${presetId}-${Date.now()}`,
            name: result.personalityType,
            description: result.communicationStyle,
            systemPrompt: PRESET_PERSONAS[0].systemPrompt,
            isPreset: false,
          };

      persona.id = `extracted-${row.id}-${Date.now()}`;

      return {
        id: `profile-${row.id}`,
        persona,
        goal: {
          id: `goal-${row.id}`,
          description: result.goal,
          successCriteria: result.successCriteria,
        },
        sourceDatasetRowId: row.id,
        sourcePreview: firstUserMessage.slice(0, 120),
      };
    } catch {
      return null;
    }
  });

  const results = await Promise.all(extractionPromises);
  const profiles = results.filter(
    (r): r is NonNullable<typeof r> => r !== null
  );

  if (profiles.length === 0) {
    return Response.json(
      { error: "Failed to extract any profiles from the provided rows" },
      { status: 422 }
    );
  }

  return Response.json({ profiles });
}
