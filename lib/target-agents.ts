import { type TargetConfig, type ConversationMessage } from "./types";

export interface TargetAgent {
  chat(conversation: ConversationMessage[], parentSpanContext?: string): Promise<string>;
}

export async function createTargetAgent(
  config: TargetConfig,
  apiKey: string,
  projectName?: string
): Promise<TargetAgent> {
  switch (config.type) {
    case "api":
      return new APITargetAgent(config.endpoint, config.headers, apiKey, projectName);
    case "remote-eval":
      throw new Error(
        "remote-eval target type cannot be used as a per-turn chat agent. Use RemoteEvalRunner instead."
      );
    default:
      throw new Error(`Unknown target agent type`);
  }
}

class APITargetAgent implements TargetAgent {
  private endpoint: string;
  private headers: Record<string, string>;
  private btApiKey: string;
  private projectName: string;

  constructor(endpoint: string, headers?: Record<string, string>, btApiKey?: string, projectName?: string) {
    this.endpoint = endpoint;
    this.headers = headers ?? {};
    this.btApiKey = btApiKey ?? "";
    this.projectName = projectName ?? "";
  }

  async chat(conversation: ConversationMessage[], parentSpanContext?: string): Promise<string> {
    const messages = conversation.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.btApiKey ? { "x-bt-api-key": this.btApiKey } : {}),
        ...(this.projectName ? { "x-bt-project": this.projectName } : {}),
        ...(parentSpanContext ? { "x-bt-parent-span": parentSpanContext } : {}),
        ...this.headers,
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Target agent API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    if (typeof data.message === "string") {
      return data.message;
    }
    if (typeof data.content === "string") {
      return data.content;
    }
    if (typeof data.response === "string") {
      return data.response;
    }
    if (typeof data.text === "string") {
      return data.text;
    }
    if (typeof data.output === "string") {
      return data.output;
    }

    throw new Error(
      `Unable to parse response from target agent. Response: ${JSON.stringify(data).slice(0, 200)}`
    );
  }
}

