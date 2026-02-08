import { NextRequest } from "next/server";
import { simulationConfigSchema } from "@/lib/schemas";
import { SimulationEngine } from "@/lib/simulation-engine";
import { RemoteEvalRunner } from "@/lib/remote-eval-runner";

export const maxDuration = 300; // 5 minutes max for simulation

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parseResult = simulationConfigSchema.safeParse(body);
    if (!parseResult.success) {
      return Response.json(
        { error: "Invalid configuration", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const config = parseResult.data;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          if (config.target.type === "remote-eval") {
            const runner = new RemoteEvalRunner(config);

            for await (const progress of runner.run()) {
              if (progress.type === "start") {
                sendEvent("start", {
                  status: "started",
                  mode: "remote-eval",
                  totalRuns: progress.totalRuns,
                  experimentUrl: progress.experimentUrl,
                });
              } else if (progress.type === "done") {
                sendEvent("done", {
                  status: "completed",
                  mode: "remote-eval",
                  experimentUrl: progress.experimentUrl,
                });
              } else {
                sendEvent("progress", progress);
              }
            }
          } else {
            const openaiApiKey = process.env.OPENAI_API_KEY;
            if (!openaiApiKey) {
              sendEvent("error", {
                error: "OPENAI_API_KEY environment variable is not set",
              });
              return;
            }

            const engine = new SimulationEngine(config, openaiApiKey);

            const { experimentId, experimentUrl } = await engine.initialize();

            sendEvent("start", {
              status: "started",
              mode: "api",
              experimentId,
              experimentUrl,
              totalRuns: config.profileMode === "paired" && config.pairedProfiles
                ? config.pairedProfiles.length
                : config.personas.length * config.goals.length,
            });

            for await (const progress of engine.run()) {
              sendEvent("progress", progress);
            }

            await engine.close();

            sendEvent("done", {
              status: "completed",
              mode: "api",
              experimentId,
              experimentUrl,
            });
          }
        } catch (error) {
          sendEvent("error", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
