import OpenAI from "openai";
import { type Persona, type Goal, type ConversationMessage } from "./types";

export class SimulatedUser {
  private openai: OpenAI;
  private persona: Persona;
  private goal: Goal;
  private model: string;
  private temperature: number;

  constructor(
    openai: OpenAI,
    persona: Persona,
    goal: Goal,
    model: string,
    temperature: number
  ) {
    this.openai = openai;
    this.persona = persona;
    this.goal = goal;
    this.model = model;
    this.temperature = temperature;
  }

  async generateInitialMessage(): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `You are starting a new conversation with a customer service agent or assistant. Generate your FIRST message to initiate the interaction.

Your goal is: "${this.goal.description}"

Remember to stay in character as described in your persona. Generate only the message content, nothing else.`,
        },
      ],
    });

    return response.choices[0]?.message?.content ?? "Hello, I need help.";
  }

  async generateNextMessage(
    conversation: ConversationMessage[]
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of conversation) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    messages.push({
      role: "user",
      content: `Based on the conversation so far, generate your NEXT message to continue working toward your goal.

Your goal is: "${this.goal.description}"
Success criteria: "${this.goal.successCriteria}"

Consider:
- What information do you still need?
- What action do you want the assistant to take?
- Has your goal been addressed? If so, you can express satisfaction and prepare to end the conversation.

Stay in character and generate only the message content, nothing else.`,
    });

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      messages,
    });

    return (
      response.choices[0]?.message?.content ?? "Can you help me with that?"
    );
  }

  private buildSystemPrompt(): string {
    return `You are simulating a user in a conversation with a customer service agent or AI assistant.

## Your Persona
Name: ${this.persona.name}
Description: ${this.persona.description}

${this.persona.systemPrompt}

## Your Goal
${this.goal.description}

Success criteria: ${this.goal.successCriteria}

## Important Rules
1. Stay in character at ALL times
2. Be realistic and natural in your responses
3. Work toward achieving your goal
4. React authentically to the assistant's responses
5. If your goal has been achieved, express satisfaction appropriately for your persona
6. NEVER break character or mention you are a simulation
7. NEVER include meta-commentary about the conversation
8. Generate ONLY the message content - no labels, no "User:" prefix`;
  }
}
