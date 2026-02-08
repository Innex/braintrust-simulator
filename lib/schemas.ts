import { z } from "zod";

export const personaSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  systemPrompt: z.string().min(10, "System prompt must be at least 10 characters"),
  isPreset: z.boolean(),
});

export const goalSchema = z.object({
  id: z.string(),
  description: z.string().min(5, "Description must be at least 5 characters"),
  successCriteria: z.string().min(10, "Success criteria must be at least 10 characters"),
});

export const apiTargetSchema = z.object({
  type: z.literal("api"),
  endpoint: z.string().url("Must be a valid URL"),
  headers: z.record(z.string(), z.string()).optional(),
});

export const remoteEvalTargetSchema = z.object({
  type: z.literal("remote-eval"),
  serverUrl: z.string().url("Must be a valid URL"),
  evalName: z.string().min(1, "Evaluator name is required"),
  orgName: z.string(),
});

export const targetConfigSchema = z.discriminatedUnion("type", [
  apiTargetSchema,
  remoteEvalTargetSchema,
]);

export const simulationSettingsSchema = z.object({
  maxTurns: z.number().int().min(1).max(50),
  parallelRuns: z.number().int().min(1).max(20),
  simulatorModel: z.string(),
  temperature: z.number().min(0).max(2),
  stopOnGoalAchieved: z.boolean(),
});

export const scorerConfigSchema = z.object({
  scorerId: z.string(),
  name: z.string(),
  type: z.enum(["online", "autoevals", "llm-judge"]),
  // For llm-judge type
  promptTemplate: z.string().optional(),
  choiceScores: z.record(z.string(), z.number()).optional(),
  useCoT: z.boolean().optional(),
});

export const customLLMJudgeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  promptTemplate: z.string().min(10, "Prompt template must be at least 10 characters"),
  choiceScores: z.record(z.string(), z.number()).refine(
    (scores) => Object.keys(scores).length >= 2,
    "At least 2 choices are required"
  ),
  useCoT: z.boolean(),
});

export const pairedProfileSchema = z.object({
  persona: personaSchema,
  goal: goalSchema,
});

export const simulationConfigSchema = z.object({
  braintrustApiKey: z.string().min(1, "API key is required"),
  projectId: z.string().min(1, "Project is required"),
  projectName: z.string().min(1, "Project name is required"),
  experimentName: z.string().optional(),
  target: targetConfigSchema,
  personas: z.array(personaSchema),
  goals: z.array(goalSchema),
  settings: simulationSettingsSchema,
  scorers: z.array(scorerConfigSchema),
  profileMode: z.enum(["matrix", "paired"]),
  pairedProfiles: z.array(pairedProfileSchema).optional(),
}).refine(
  (data) => {
    if (data.profileMode === "paired") {
      return data.pairedProfiles !== undefined && data.pairedProfiles.length >= 1;
    }
    return data.personas.length >= 1 && data.goals.length >= 1;
  },
  {
    message: "At least one persona and goal (matrix) or one paired profile (paired) is required",
    path: ["personas"],
  }
);

export type PersonaFormValues = z.infer<typeof personaSchema>;
export type GoalFormValues = z.infer<typeof goalSchema>;
export type TargetConfigFormValues = z.infer<typeof targetConfigSchema>;
export type SimulationSettingsFormValues = z.infer<typeof simulationSettingsSchema>;
export type ScorerConfigFormValues = z.infer<typeof scorerConfigSchema>;
export type SimulationConfigFormValues = z.infer<typeof simulationConfigSchema>;
