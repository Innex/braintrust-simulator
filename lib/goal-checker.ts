import OpenAI from "openai";
import { type Goal, type ConversationMessage, type GoalCheckResult } from "./types";

export class GoalChecker {
  private openai: OpenAI;
  private goal: Goal;
  private model: string;

  constructor(openai: OpenAI, goal: Goal, model: string) {
    this.openai = openai;
    this.goal = goal;
    this.model = model;
  }

  async check(conversation: ConversationMessage[]): Promise<GoalCheckResult> {
    const conversationText = conversation
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are evaluating whether a conversation has achieved a specific goal.

Your task is to analyze the conversation and determine if the user's goal has been successfully addressed by the assistant.

Goal: ${this.goal.description}
Success Criteria: ${this.goal.successCriteria}

Evaluation Guidelines:
- "achieved" should be true if the assistant has provided the information or taken the action needed to satisfy the goal
- Consider partial success: if most of the goal is addressed, it can be considered achieved
- The user expressing satisfaction is a strong signal of goal achievement
- The user asking follow-up questions about NEW topics (not the original goal) suggests the original goal was met

Respond with a JSON object in this exact format:
{
  "achieved": boolean,
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation of your assessment"
}`,
        },
        {
          role: "user",
          content: `Please evaluate this conversation:

${conversationText}

Has the goal been achieved?`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";

    try {
      const result = JSON.parse(content);
      return {
        achieved: Boolean(result.achieved),
        confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
        reasoning: result.reasoning ?? "Unable to determine",
      };
    } catch {
      return {
        achieved: false,
        confidence: 0,
        reasoning: "Failed to parse goal check response",
      };
    }
  }
}
