import { init, type Experiment, type Span } from "braintrust";
import OpenAI from "openai";
import {
  type SimulationConfig,
  type SimulationProgress,
  type SimulationRun,
  type Persona,
  type Goal,
} from "./types";
import { SimulatedUser } from "./simulated-user";
import { GoalChecker } from "./goal-checker";
import { createTargetAgent, type TargetAgent } from "./target-agents";
import { runScorer } from "./scorers";

export class SimulationEngine {
  private config: SimulationConfig;
  private experiment: Experiment | null = null;
  private simulatorClient: OpenAI;
  private targetAgent: TargetAgent | null = null;

  constructor(config: SimulationConfig, openaiApiKey: string) {
    this.config = config;
    // Untraced client - simulator LLM calls should not appear in experiment traces
    this.simulatorClient = new OpenAI({ apiKey: openaiApiKey });
  }

  async initialize(): Promise<{ experimentId: string; experimentUrl: string }> {
    if (this.config.target.type === "remote-eval") {
      throw new Error(
        "SimulationEngine does not support remote-eval targets. Use RemoteEvalRunner instead."
      );
    }

    this.experiment = await init({
      project: this.config.projectName,
      experiment:
        this.config.experimentName ||
        `simulation-${new Date().toISOString().split("T")[0]}-${Date.now()}`,
      apiKey: this.config.braintrustApiKey,
    });

    this.targetAgent = await createTargetAgent(
      this.config.target,
      this.config.braintrustApiKey,
      this.config.projectName
    );

    const experimentId = await this.experiment.id;
    const appUrl = process.env.BRAINTRUST_APP_URL || "https://www.braintrust.dev";
    const experimentUrl = `${appUrl}/app/project/${encodeURIComponent(this.config.projectName)}/experiments/${experimentId}`;

    return {
      experimentId,
      experimentUrl,
    };
  }

  async *run(): AsyncGenerator<SimulationProgress> {
    if (!this.experiment || !this.targetAgent) {
      throw new Error("Engine not initialized. Call initialize() first.");
    }

    const runs: Array<{ persona: Persona; goal: Goal }> = [];
    if (this.config.profileMode === "paired" && this.config.pairedProfiles) {
      for (const pair of this.config.pairedProfiles) {
        runs.push({ persona: pair.persona, goal: pair.goal });
      }
    } else {
      for (const persona of this.config.personas) {
        for (const goal of this.config.goals) {
          runs.push({ persona, goal });
        }
      }
    }

    let completedRuns = 0;
    const totalRuns = runs.length;

    for (const { persona, goal } of runs) {
      try {
        yield* this.runSingleSimulation(
          persona,
          goal,
          totalRuns,
          completedRuns
        );
        completedRuns++;
      } catch (error) {
        yield {
          type: "error",
          persona: persona.name,
          goal: goal.description,
          error: error instanceof Error ? error.message : String(error),
        };
        completedRuns++;
      }
    }
  }

  private async *runSingleSimulation(
    persona: Persona,
    goal: Goal,
    totalRuns: number,
    completedRuns: number
  ): AsyncGenerator<SimulationProgress> {
    const run: SimulationRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      persona,
      goal,
      conversation: [],
      status: "running",
      turnCount: 0,
      goalAchieved: null,
      completionReason: null,
    };

    const simulatedUser = new SimulatedUser(
      this.simulatorClient,
      persona,
      goal,
      this.config.settings.simulatorModel,
      this.config.settings.temperature
    );

    const goalChecker = new GoalChecker(
      this.simulatorClient,
      goal,
      this.config.settings.simulatorModel
    );

    let userMessage = await simulatedUser.generateInitialMessage();
    run.conversation.push({
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    });

    // Progress events are collected during traced() and yielded after,
    // since generators can't yield from inside traced callbacks
    const progressEvents: SimulationProgress[] = [];

    await this.experiment!.traced(
      async (rootSpan: Span) => {
        rootSpan.log({
          input: {
            persona: {
              id: persona.id,
              name: persona.name,
              description: persona.description,
            },
            goal: {
              id: goal.id,
              description: goal.description,
              successCriteria: goal.successCriteria,
            },
            initialMessage: userMessage,
          },
        });

        while (run.turnCount < this.config.settings.maxTurns) {
          run.turnCount++;
          const currentTurn = run.turnCount;

          await rootSpan.traced(
            async (turnSpan: Span) => {
              turnSpan.log({
                input: userMessage,
                metadata: { turnNumber: currentTurn },
              });

              // Exported span context allows the agent to nest its traces under this turn
              const turnSpanContext = await turnSpan.export();
              const agentResponse = await this.targetAgent!.chat(
                run.conversation,
                turnSpanContext
              );
              run.conversation.push({
                role: "assistant",
                content: agentResponse,
                timestamp: Date.now(),
              });

              turnSpan.log({ output: agentResponse });

              return agentResponse;
            },
            { name: `turn_${currentTurn}` }
          );

          progressEvents.push({
            type: "turn",
            runId: run.id,
            persona: persona.name,
            goal: goal.description,
            turn: run.turnCount,
            totalRuns,
            completedRuns,
            lastMessage: run.conversation[run.conversation.length - 1].content.slice(0, 150),
          });

          if (this.config.settings.stopOnGoalAchieved) {
            const goalStatus = await goalChecker.check(run.conversation);

            if (goalStatus.achieved) {
              run.goalAchieved = true;
              run.completionReason = "goal_achieved";
              break;
            }
          }

          if (run.turnCount >= this.config.settings.maxTurns) {
            run.goalAchieved = false;
            run.completionReason = "max_turns";
            break;
          }

          userMessage = await simulatedUser.generateNextMessage(run.conversation);
          run.conversation.push({
            role: "user",
            content: userMessage,
            timestamp: Date.now(),
          });
        }

        if (run.goalAchieved === null) {
          const finalGoalStatus = await goalChecker.check(run.conversation);
          run.goalAchieved = finalGoalStatus.achieved;
        }

        run.status = "completed";

        const scores: Record<string, number> = {
          goalAchieved: run.goalAchieved ? 1 : 0,
          efficiency: Math.max(
            0,
            1 - (run.turnCount - 1) / this.config.settings.maxTurns
          ),
        };

        const scorerMetadata: Record<string, unknown> = {};

        if (this.config.scorers && this.config.scorers.length > 0) {
          for (const scorerConfig of this.config.scorers) {
            try {
              const result = await runScorer(
                scorerConfig,
                run.conversation,
                goal,
                persona,
                this.simulatorClient,
                this.config.settings.simulatorModel
              );
              if (result) {
                scores[result.name] = result.score;
                if (result.metadata) {
                  scorerMetadata[result.name] = result.metadata;
                }
              }
            } catch (error) {
              console.error(`Error running scorer ${scorerConfig.name}:`, error);
            }
          }
        }

        rootSpan.log({
          output: {
            conversation: run.conversation.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            turnCount: run.turnCount,
            completionReason: run.completionReason,
          },
          expected: {
            goalAchieved: true,
          },
          scores,
          metadata: {
            personaId: persona.id,
            personaName: persona.name,
            goalId: goal.id,
            simulatorModel: this.config.settings.simulatorModel,
            maxTurns: this.config.settings.maxTurns,
            scorerResults: scorerMetadata,
            selectedScorers: this.config.scorers?.map((s) => s.name) || [],
          },
        });
      },
      {
        name: `simulation_${persona.name}_${goal.id}`,
        event: {
          input: {
            persona: { id: persona.id, name: persona.name },
            goal: { id: goal.id, description: goal.description },
          },
        },
      }
    );

    for (const event of progressEvents) {
      yield event;
    }

    yield {
      type: "completed",
      runId: run.id,
      persona: persona.name,
      goal: goal.description,
      turn: run.turnCount,
      goalAchieved: run.goalAchieved ?? undefined,
      totalRuns,
      completedRuns: completedRuns + 1,
    };
  }

  async close(): Promise<void> {
    if (this.experiment) {
      await this.experiment.flush();
    }
  }
}
