"use client";

import { useState, useCallback } from "react";
import { type ExtractedProfile } from "@/lib/types";

interface ChatMessage {
  role: string;
  content: string;
}

interface DatasetRow {
  id: string;
  input: unknown;
  output?: unknown;
  expected?: unknown;
  metadata?: unknown;
}

/** Try to coerce a single item into a ChatMessage. Handles {role,content}, {role,text}, plain strings. */
function toMessage(item: unknown, fallbackRole?: string): ChatMessage | null {
  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    const role = typeof obj.role === "string" ? obj.role : fallbackRole;
    const content =
      typeof obj.content === "string"
        ? obj.content
        : typeof obj.text === "string"
          ? obj.text
          : typeof obj.message === "string"
            ? obj.message
            : null;
    if (role && content) {
      return { role, content };
    }
  }
  if (typeof item === "string" && fallbackRole) {
    return { role: fallbackRole, content: item };
  }
  return null;
}

/** Extract an array of ChatMessages from an unknown value (could be array, object with messages/conversation/chat key, etc.) */
function extractMessages(value: unknown): ChatMessage[] {
  if (!value) return [];

  // Direct array of messages
  if (Array.isArray(value)) {
    const msgs = value.map((m) => toMessage(m)).filter((m): m is ChatMessage => m !== null);
    if (msgs.length > 0) return msgs;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    // Nested under common keys: messages, conversation, chat, turns, history, thread
    for (const key of ["messages", "conversation", "chat", "turns", "history", "thread"]) {
      if (Array.isArray(obj[key])) {
        const msgs = (obj[key] as unknown[])
          .map((m) => toMessage(m))
          .filter((m): m is ChatMessage => m !== null);
        if (msgs.length > 0) return msgs;
      }
    }
  }

  return [];
}

function normalizeDatasetRows(
  rows: DatasetRow[]
): { normalized: Array<{ id: string; messages: ChatMessage[] }>; sampleKeys: string[] } {
  const normalized: Array<{ id: string; messages: ChatMessage[] }> = [];
  let sampleKeys: string[] = [];

  for (const row of rows) {
    const id = row.id ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Capture sample keys from first row for error reporting
    if (sampleKeys.length === 0) {
      sampleKeys = Object.keys(row);
      if (typeof row.input === "object" && row.input !== null && !Array.isArray(row.input)) {
        sampleKeys = sampleKeys.concat(
          Object.keys(row.input as Record<string, unknown>).map((k) => `input.${k}`)
        );
      }
    }

    let messages: ChatMessage[] = [];

    // 1. Try extracting from input (most common)
    messages = extractMessages(row.input);

    // 2. Try extracting from output if input had nothing
    if (messages.length === 0) {
      messages = extractMessages(row.output);
    }

    // 3. Try extracting from expected
    if (messages.length === 0) {
      messages = extractMessages(row.expected);
    }

    // 4. Try input as string + output as string → synthetic 2-turn conversation
    if (messages.length === 0) {
      const inputMsg = toMessage(row.input, "user");
      const outputMsg = toMessage(row.output, "assistant");
      if (inputMsg && outputMsg) {
        messages = [inputMsg, outputMsg];
      } else if (inputMsg) {
        // Single-turn: just the user message (useful if output is structured/non-string)
        messages = [inputMsg];
      }
    }

    // 5. Try top-level row keys (some datasets put messages at root level)
    if (messages.length === 0) {
      messages = extractMessages(row);
    }

    if (messages.length > 0) {
      normalized.push({ id, messages });
    }
  }

  return { normalized, sampleKeys };
}

export function useDatasetProfiles(apiKey: string | null) {
  const [profiles, setProfiles] = useState<ExtractedProfile[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const extractFromDataset = useCallback(
    async (datasetId: string) => {
      if (!apiKey || !datasetId) {
        setExtractionError("API key and dataset ID are required");
        return;
      }

      setExtracting(true);
      setExtractionError(null);

      try {
        const rowsResponse = await fetch(
          `/api/braintrust/dataset-rows?datasetId=${encodeURIComponent(datasetId)}&limit=50`,
          {
            headers: { "x-bt-api-key": apiKey },
          }
        );

        if (!rowsResponse.ok) {
          const data = await rowsResponse.json().catch(() => ({}));
          throw new Error(data.error || `Failed to fetch dataset rows: ${rowsResponse.status}`);
        }

        const rowsData = await rowsResponse.json();
        const rawRows: DatasetRow[] = rowsData.rows || [];

        if (rawRows.length === 0) {
          throw new Error("Dataset has no rows");
        }

        const { normalized, sampleKeys } = normalizeDatasetRows(rawRows);

        if (normalized.length === 0) {
          const keysHint = sampleKeys.length > 0
            ? ` Found keys: [${sampleKeys.join(", ")}].`
            : "";
          throw new Error(
            `No conversation rows found in dataset.${keysHint} Expected messages with role and content fields in input (as array, or under input.messages/input.conversation), or input/output string pairs.`
          );
        }

        const extractResponse = await fetch("/api/extract-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: normalized }),
        });

        if (!extractResponse.ok) {
          const data = await extractResponse.json().catch(() => ({}));
          throw new Error(data.error || `Profile extraction failed: ${extractResponse.status}`);
        }

        const extractData = await extractResponse.json();
        setProfiles(extractData.profiles || []);
      } catch (err) {
        setExtractionError(err instanceof Error ? err.message : "Extraction failed");
        setProfiles([]);
      } finally {
        setExtracting(false);
      }
    },
    [apiKey]
  );

  const removeProfile = useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateProfile = useCallback(
    (id: string, updates: Partial<ExtractedProfile>) => {
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const clearProfiles = useCallback(() => {
    setProfiles([]);
    setExtractionError(null);
  }, []);

  return {
    profiles,
    extracting,
    extractionError,
    extractFromDataset,
    removeProfile,
    updateProfile,
    clearProfiles,
  };
}
