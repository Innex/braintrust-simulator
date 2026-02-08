// Core types for the Multi-Turn Simulator

export interface SimulationConfig {
  braintrustApiKey: string;
  projectId: string;
  projectName: string;
  experimentName?: string;
  target: TargetConfig;
  personas: Persona[];
  goals: Goal[];
  settings: SimulationSettings;
  scorers: ScorerConfig[];
  profileMode: "matrix" | "paired";
  pairedProfiles?: Array<{ persona: Persona; goal: Goal }>;
}

export type TargetConfig =
  | { type: "api"; endpoint: string; headers?: Record<string, string> }
  | { type: "remote-eval"; serverUrl: string; evalName: string; orgName: string };

export interface Persona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isPreset: boolean;
}

export interface Goal {
  id: string;
  description: string;
  successCriteria: string;
}

export interface SimulationSettings {
  maxTurns: number;
  parallelRuns: number;
  simulatorModel: string;
  temperature: number;
  stopOnGoalAchieved: boolean;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SimulationRun {
  id: string;
  persona: Persona;
  goal: Goal;
  conversation: ConversationMessage[];
  status: "pending" | "running" | "completed" | "failed";
  turnCount: number;
  goalAchieved: boolean | null;
  completionReason: "goal_achieved" | "max_turns" | "error" | null;
  error?: string;
}

export interface SimulationProgress {
  type: "start" | "turn" | "completed" | "error" | "done";
  experimentId?: string;
  experimentUrl?: string;
  runId?: string;
  persona?: string;
  goal?: string;
  turn?: number;
  totalRuns?: number;
  completedRuns?: number;
  lastMessage?: string;
  goalAchieved?: boolean;
  error?: string;
}

export interface GoalCheckResult {
  achieved: boolean;
  confidence: number;
  reasoning: string;
}

export interface BraintrustProject {
  id: string;
  name: string;
  org_id: string;
}

export interface Scorer {
  id: string;
  name: string;
  description?: string;
  type: "online" | "autoevals" | "llm-judge";
}

export interface ScorerConfig {
  scorerId: string;
  name: string;
  type: "online" | "autoevals" | "llm-judge";
  // For llm-judge type
  promptTemplate?: string;
  choiceScores?: Record<string, number>;
  useCoT?: boolean;
}

export interface CustomLLMJudgeConfig {
  name: string;
  description: string;
  promptTemplate: string;
  choiceScores: Record<string, number>;
  useCoT: boolean;
}

export interface BraintrustDataset {
  id: string;
  name: string;
}

export interface ExtractedProfile {
  id: string;
  persona: Persona;
  goal: Goal;
  sourceDatasetRowId: string;
  sourcePreview: string;
}

export interface RemoteEvalParameters {
  persona: {
    name: string;
    description: string;
    systemPrompt: string;
  };
  goal: {
    description: string;
    successCriteria: string;
  };
  maxTurns: number;
  temperature: number;
  simulatorModel: string;
  stopOnGoalAchieved: boolean;
}
