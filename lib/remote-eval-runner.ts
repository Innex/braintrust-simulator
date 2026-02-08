import {
  type SimulationConfig,
  type SimulationProgress,
  type Persona,
  type Goal,
  type RemoteEvalParameters,
} from "./types";

const BRAINTRUST_API_URL = process.env.BRAINTRUST_API_URL || "https://api.braintrust.dev/v1";

export class RemoteEvalRunner {
  private config: SimulationConfig;
  private serverUrl: string;
  private evalName: string;
  private orgName: string;
  private resolvedEvalName: string | null = null;
  private experimentUrl: string | null = null;

  constructor(config: SimulationConfig) {
    if (config.target.type !== "remote-eval") {
      throw new Error("RemoteEvalRunner requires a remote-eval target config");
    }
    this.config = config;
    this.serverUrl = config.target.serverUrl;
    this.evalName = config.target.evalName;
    this.orgName = config.target.orgName ?? "";
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.braintrustApiKey}`,
    };
    if (this.orgName) {
      headers["x-bt-org-name"] = this.orgName;
    }
    return headers;
  }

  private async resolveOrgName(): Promise<void> {
    if (this.orgName) return;

    // Try without org name first - maybe the server doesn't require one
    const response = await fetch(`${this.serverUrl}/list`, {
      headers: {
        Authorization: `Bearer ${this.config.braintrustApiKey}`,
      },
    });

    if (response.ok) return;

    // Server requires org name. Look it up from the Braintrust API using project org_id.
    try {
      const projectResponse = await fetch(
        `${BRAINTRUST_API_URL}/project/${this.config.projectId}`,
        { headers: { Authorization: `Bearer ${this.config.braintrustApiKey}` } },
      );
      if (projectResponse.ok) {
        const projectData = await projectResponse.json();
        const orgId = projectData.org_id;
        if (orgId) {
          const orgResponse = await fetch(
            `${BRAINTRUST_API_URL}/organization/${encodeURIComponent(orgId)}`,
            { headers: { Authorization: `Bearer ${this.config.braintrustApiKey}` } },
          );
          if (orgResponse.ok) {
            const orgData = await orgResponse.json();
            if (orgData.name) {
              this.orgName = orgData.name;
              return;
            }
          }
          // Parse org name from 403 error: [user_org=X]
          const orgErrorText = await orgResponse.text().catch(() => "");
          const orgMatch = orgErrorText.match(/\[user_org=([^\]]+)\]/);
          if (orgMatch) {
            this.orgName = orgMatch[1];
            return;
          }
        }
      }
    } catch {
      // ignore, fall through
    }
  }

  private async resolveEvalName(): Promise<string> {
    if (this.resolvedEvalName) {
      return this.resolvedEvalName;
    }

    const response = await fetch(`${this.serverUrl}/list`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      this.resolvedEvalName = this.evalName;
      return this.evalName;
    }

    const evalMap: Record<string, unknown> = await response.json();
    const keys = Object.keys(evalMap);

    const exactMatch = keys.find((k) => k === this.evalName);
    if (exactMatch) {
      this.resolvedEvalName = exactMatch;
      return exactMatch;
    }

    const prefixMatch = keys.find((k) => k.startsWith(this.evalName));
    if (prefixMatch) {
      this.resolvedEvalName = prefixMatch;
      return prefixMatch;
    }

    this.resolvedEvalName = this.evalName;
    return this.evalName;
  }

  async *run(): AsyncGenerator<SimulationProgress> {
    await this.resolveOrgName();
    const resolvedName = await this.resolveEvalName();

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

    const totalRuns = runs.length;
    let completedRuns = 0;

    const experimentName = this.config.experimentName
      || `simulation-${new Date().toISOString().split("T")[0]}-${Date.now()}`;

    yield {
      type: "start",
      totalRuns,
    };

    // Build all data rows upfront and send in a single /eval request
    // so all rows land in ONE experiment
    const dataRows = runs.map(({ persona, goal }) => ({
      input: {
        persona: {
          name: persona.name,
          description: persona.description,
          systemPrompt: persona.systemPrompt,
        },
        goal: {
          description: goal.description,
          successCriteria: goal.successCriteria,
        },
      },
      metadata: {
        type: "simulated_conversation",
        persona: persona.name,
        goal: goal.description,
      },
    }));

    // Shared parameters (no persona/goal - those are per-row in data)
    const parameters: Omit<RemoteEvalParameters, "persona" | "goal"> = {
      maxTurns: this.config.settings.maxTurns,
      temperature: this.config.settings.temperature,
      simulatorModel: this.config.settings.simulatorModel,
      stopOnGoalAchieved: this.config.settings.stopOnGoalAchieved,
    };

    const requestBody = {
      name: resolvedName,
      parameters,
      data: { data: dataRows },
      experiment_name: experimentName,
      project_id: this.config.projectId,
      stream: true,
    };

    try {
      const response = await fetch(`${this.serverUrl}/eval`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        yield {
          type: "error",
          persona: "all",
          goal: "all",
          error: `Remote eval error: ${response.status} - ${errorText}`,
        };
      } else {
        yield* this.parseEvalStream(response, runs, totalRuns);
        completedRuns = totalRuns;
      }
    } catch (error) {
      yield {
        type: "error",
        persona: "all",
        goal: "all",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    yield {
      type: "done",
      totalRuns,
      completedRuns,
      experimentUrl: this.experimentUrl ?? undefined,
    };
  }

  private async *parseEvalStream(
    response: Response,
    runs: Array<{ persona: Persona; goal: Goal }>,
    totalRuns: number,
  ): AsyncGenerator<SimulationProgress> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body from remote eval");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let completedRuns = 0;
    // Track which row index we're on based on result events
    let currentRowIndex = 0;
    const runId = `remote-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;
            try {
              const data = JSON.parse(dataStr);

              // Use the current row's persona/goal for event context
              const run = runs[Math.min(currentRowIndex, runs.length - 1)];

              yield* this.translateEvent(
                currentEvent,
                data,
                run.persona,
                run.goal,
                `${runId}-${currentRowIndex}`,
                totalRuns,
                completedRuns,
                0,
              );

              // "result" events signal one row is complete
              if (currentEvent === "result") {
                completedRuns++;
                currentRowIndex++;
                yield {
                  type: "completed",
                  runId: `${runId}-${currentRowIndex - 1}`,
                  persona: run.persona.name,
                  goal: run.goal.description,
                  totalRuns,
                  completedRuns,
                };
              }
            } catch {
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private *translateEvent(
    eventType: string,
    data: Record<string, unknown>,
    persona: Persona,
    goal: Goal,
    runId: string,
    totalRuns: number,
    completedRuns: number,
    currentTurn: number,
  ): Generator<SimulationProgress> {
    switch (eventType) {
      case "start": {
        const url = data.experimentUrl ?? data.experiment_url;
        if (typeof url === "string" && !this.experimentUrl) {
          this.experimentUrl = url;
        }
        break;
      }
      case "progress": {
        const turn = typeof data.turn === "number" ? data.turn : currentTurn + 1;
        const lastMessage =
          typeof data.lastMessage === "string"
            ? data.lastMessage.slice(0, 150)
            : typeof data.message === "string"
              ? String(data.message).slice(0, 150)
              : undefined;
        yield {
          type: "turn",
          runId,
          persona: persona.name,
          goal: goal.description,
          turn,
          totalRuns,
          completedRuns,
          lastMessage,
        };
        break;
      }
      case "summary": {
        const url = data.experimentUrl ?? data.experiment_url;
        if (typeof url === "string" && !this.experimentUrl) {
          this.experimentUrl = url;
        }
        const goalAchieved =
          typeof data.goalAchieved === "boolean" ? data.goalAchieved : undefined;
        yield {
          type: "completed",
          runId,
          persona: persona.name,
          goal: goal.description,
          goalAchieved,
          experimentUrl: typeof url === "string" ? url : undefined,
          totalRuns,
          completedRuns,
        };
        break;
      }
      case "error": {
        const errorMsg =
          typeof data.error === "string" ? data.error : "Unknown remote eval error";
        yield {
          type: "error",
          persona: persona.name,
          goal: goal.description,
          error: errorMsg,
        };
        break;
      }
      case "done":
        break;
      default: {
        if (data.type === "turn" || data.type === "progress") {
          yield {
            type: "turn",
            runId,
            persona: persona.name,
            goal: goal.description,
            turn: typeof data.turn === "number" ? data.turn : currentTurn + 1,
            totalRuns,
            completedRuns,
            lastMessage:
              typeof data.lastMessage === "string"
                ? data.lastMessage.slice(0, 150)
                : undefined,
          };
        }
        break;
      }
    }
  }
}
