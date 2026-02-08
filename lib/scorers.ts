import OpenAI from "openai";
import { type ConversationMessage, type ScorerConfig, type Goal, type Persona } from "./types";

interface ScorerResult {
  name: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export async function runScorer(
  scorerConfig: ScorerConfig,
  conversation: ConversationMessage[],
  goal: Goal,
  persona: Persona,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult | null> {
  if (scorerConfig.type === "autoevals") {
    return runAutoevalsScorer(scorerConfig, conversation, goal, openaiClient, model);
  } else if (scorerConfig.type === "llm-judge") {
    return runCustomLLMJudge(scorerConfig, conversation, goal, persona, openaiClient, model);
  }
  return null;
}

async function runCustomLLMJudge(
  scorerConfig: ScorerConfig,
  conversation: ConversationMessage[],
  goal: Goal,
  persona: Persona,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult | null> {
  if (!scorerConfig.promptTemplate || !scorerConfig.choiceScores) {
    console.warn(`LLM judge scorer ${scorerConfig.name} missing promptTemplate or choiceScores`);
    return null;
  }

  try {
    const conversationText = conversation
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n\n");

    const lastAssistantMessage = [...conversation]
      .reverse()
      .find((msg) => msg.role === "assistant")?.content || "";

    const lastUserMessage = [...conversation]
      .reverse()
      .find((msg) => msg.role === "user")?.content || "";

    const renderedPrompt = scorerConfig.promptTemplate
      .replace(/\{\{conversation\}\}/g, conversationText)
      .replace(/\{\{output\}\}/g, lastAssistantMessage)
      .replace(/\{\{input\}\}/g, lastUserMessage)
      .replace(/\{\{goal\}\}/g, goal.description)
      .replace(/\{\{goal_criteria\}\}/g, goal.successCriteria)
      .replace(/\{\{persona\}\}/g, persona.name)
      .replace(/\{\{persona_description\}\}/g, persona.description);

    const choices = Object.keys(scorerConfig.choiceScores);
    const choicesText = choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join("\n");

    const systemPrompt = `You are an expert evaluator. Analyze the provided content and select the most appropriate choice.

Available choices:
${choicesText}

${scorerConfig.useCoT ? "First explain your reasoning step by step, then provide your final choice." : ""}

Respond with a JSON object in this exact format:
${scorerConfig.useCoT ? '{"reasoning": "<your step-by-step reasoning>", "choice": "<exact choice text>"}' : '{"choice": "<exact choice text>"}'}`;

    const response = await openaiClient.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: renderedPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    const selectedChoice = result.choice;

    let score = 0;
    if (selectedChoice && scorerConfig.choiceScores[selectedChoice] !== undefined) {
      score = scorerConfig.choiceScores[selectedChoice];
    } else {
      for (const [choice, choiceScore] of Object.entries(scorerConfig.choiceScores)) {
        if (selectedChoice?.toLowerCase().includes(choice.toLowerCase())) {
          score = choiceScore;
          break;
        }
      }
    }

    return {
      name: scorerConfig.name,
      score: Math.max(0, Math.min(1, score)),
      metadata: {
        choice: selectedChoice,
        reasoning: result.reasoning,
        availableChoices: choices,
      },
    };
  } catch (error) {
    console.error(`Error running LLM judge ${scorerConfig.name}:`, error);
    return null;
  }
}

async function runAutoevalsScorer(
  scorerConfig: ScorerConfig,
  conversation: ConversationMessage[],
  goal: Goal,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult | null> {

  const conversationText = conversation
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n\n");

  const lastAssistantMessage = [...conversation]
    .reverse()
    .find((msg) => msg.role === "assistant")?.content || "";

  const lastUserMessage = [...conversation]
    .reverse()
    .find((msg) => msg.role === "user")?.content || "";

  try {
    switch (scorerConfig.scorerId) {
      case "autoevals-factuality":
        return await runFactualityScorer(
          conversationText,
          lastAssistantMessage,
          openaiClient,
          model
        );

      case "autoevals-helpfulness":
        return await runHelpfulnessScorer(
          conversationText,
          lastAssistantMessage,
          goal,
          openaiClient,
          model
        );

      case "autoevals-relevance":
        return await runRelevanceScorer(
          lastUserMessage,
          lastAssistantMessage,
          openaiClient,
          model
        );

      case "autoevals-coherence":
        return await runCoherenceScorer(
          conversationText,
          openaiClient,
          model
        );

      default:
        console.warn(`Unknown autoevals scorer: ${scorerConfig.scorerId}`);
        return null;
    }
  } catch (error) {
    console.error(`Error running scorer ${scorerConfig.name}:`, error);
    return null;
  }
}

async function runFactualityScorer(
  context: string,
  output: string,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult> {
  const response = await openaiClient.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are an expert evaluator. Assess whether the assistant's response is factually consistent with the conversation context.
Only evaluate factual consistency - do not penalize for missing information, just for incorrect information.
Respond with a JSON object: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}`,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nAssistant's last response:\n${output}\n\nIs this response factually consistent with the context?`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0]?.message?.content || '{"score": 0.5}');
  return {
    name: "Factuality",
    score: Math.max(0, Math.min(1, result.score)),
    metadata: { reasoning: result.reasoning },
  };
}

async function runHelpfulnessScorer(
  context: string,
  output: string,
  goal: Goal,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult> {
  const response = await openaiClient.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are an expert evaluator. Assess how helpful the assistant's response is in helping the user achieve their goal.
Consider: Does the response address the user's needs? Is it actionable? Is it complete?
Respond with a JSON object: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}`,
      },
      {
        role: "user",
        content: `User's goal: ${goal.description}\n\nConversation:\n${context}\n\nAssistant's last response:\n${output}\n\nHow helpful is this response?`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0]?.message?.content || '{"score": 0.5}');
  return {
    name: "Helpfulness",
    score: Math.max(0, Math.min(1, result.score)),
    metadata: { reasoning: result.reasoning },
  };
}

async function runRelevanceScorer(
  query: string,
  output: string,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult> {
  const response = await openaiClient.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are an expert evaluator. Assess whether the assistant's response is relevant to the user's query.
Consider: Does the response address what the user asked about? Is it on-topic?
Respond with a JSON object: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}`,
      },
      {
        role: "user",
        content: `User's message:\n${query}\n\nAssistant's response:\n${output}\n\nIs this response relevant to the user's message?`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0]?.message?.content || '{"score": 0.5}');
  return {
    name: "Relevance",
    score: Math.max(0, Math.min(1, result.score)),
    metadata: { reasoning: result.reasoning },
  };
}

async function runCoherenceScorer(
  conversation: string,
  openaiClient: OpenAI,
  model: string
): Promise<ScorerResult> {
  const response = await openaiClient.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are an expert evaluator. Assess the logical coherence of the conversation.
Consider: Does the assistant's responses follow logically? Are there contradictions? Is the flow natural?
Respond with a JSON object: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}`,
      },
      {
        role: "user",
        content: `Conversation:\n${conversation}\n\nHow coherent is this conversation?`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0]?.message?.content || '{"score": 0.5}');
  return {
    name: "Coherence",
    score: Math.max(0, Math.min(1, result.score)),
    metadata: { reasoning: result.reasoning },
  };
}
