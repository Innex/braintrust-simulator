import { NextRequest } from "next/server";
import OpenAI from "openai";
import { initLogger, wrapOpenAI, startSpan } from "braintrust";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a helpful customer service agent for TechGadgets, an online electronics retailer.

About TechGadgets:
- We sell phones, laptops, tablets, and accessories
- Free shipping on orders over $50
- 30-day return policy
- Current promotion: 20% off all accessories with code SAVE20

You can help customers with:
- Order status (make up realistic order numbers and dates)
- Returns and refunds
- Product information
- Account issues
- General questions

Be helpful, friendly, and concise. If you can resolve their issue, do so. If you need more information, ask for it.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messageSchema = z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }));
    const parsed = messageSchema.safeParse(body.messages);
    const messages = parsed.success ? parsed.data : [];

    const btApiKey = request.headers.get("x-bt-api-key");
    const btProject = request.headers.get("x-bt-project");
    const parentSpanContext = request.headers.get("x-bt-parent-span");

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    let openai: OpenAI;

    if (btApiKey && btProject) {
      initLogger({
        projectName: btProject,
        apiKey: btApiKey,
      });

      openai = wrapOpenAI(new OpenAI({ apiKey: openaiApiKey }));
    } else {
      openai = new OpenAI({ apiKey: openaiApiKey });
    }

    const turnNumber = messages.filter((m) => m.role === "user").length;

    if (btApiKey && btProject && parentSpanContext) {
      const span = startSpan({
        name: `TechGadgets_Agent`,
        parent: parentSpanContext,
      });

      try {
        span.log({
          input: messages[messages.length - 1]?.content,
          metadata: { turnNumber },
        });

        const response = await openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
        });

        const output = response.choices[0]?.message?.content ?? "I apologize, I'm having trouble responding right now.";

        span.log({ output });

        return Response.json({ message: output });
      } finally {
        span.end();
      }
    } else {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
      });

      const content = response.choices[0]?.message?.content ?? "I apologize, I'm having trouble responding right now.";
      return Response.json({ message: content });
    }
  } catch (error) {
    console.error("Test agent error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
