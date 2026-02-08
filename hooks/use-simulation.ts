"use client";

import { useState, useCallback, useRef } from "react";
import { type SimulationConfig, type SimulationProgress } from "@/lib/types";

export type SimulationStatus = "idle" | "running" | "completed" | "error";
export type SimulationMode = "api" | "remote-eval" | null;

export function useSimulation() {
  const [status, setStatus] = useState<SimulationStatus>("idle");
  const [progress, setProgress] = useState<SimulationProgress[]>([]);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [experimentUrl, setExperimentUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<SimulationMode>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const runSimulation = useCallback(async (config: SimulationConfig) => {
    setStatus("running");
    setProgress([]);
    setExperimentId(null);
    setExperimentUrl(null);
    setMode(null);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Simulation failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (data.mode) {
                setMode(data.mode);
              }
              if (data.experimentId) {
                setExperimentId(data.experimentId);
              }
              if (data.experimentUrl) {
                setExperimentUrl(data.experimentUrl);
              }
              if (data.status === "completed") {
                setStatus("completed");
              }
              if (data.error) {
                setError(data.error);
                setStatus("error");
              }
              if (data.type) {
                setProgress((prev) => [...prev, data as SimulationProgress]);
              }
            } catch {
            }
          }
        }
      }

      if (status !== "error") {
        setStatus("completed");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Simulation failed");
      setStatus("error");
    }
  }, [status]);

  const cancelSimulation = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress([]);
    setExperimentId(null);
    setExperimentUrl(null);
    setMode(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    experimentId,
    experimentUrl,
    mode,
    error,
    runSimulation,
    cancelSimulation,
    reset,
  };
}
