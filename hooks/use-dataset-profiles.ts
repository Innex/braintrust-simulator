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
  metadata?: unknown;
}

function normalizeDatasetRows(
  rows: DatasetRow[]
): Array<{ id: string; messages: ChatMessage[] }> {
  const normalized: Array<{ id: string; messages: ChatMessage[] }> = [];

  for (const row of rows) {
    const id = row.id ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let messages: ChatMessage[] = [];

    if (Array.isArray(row.input)) {
      const validMessages = row.input.filter(
        (m): m is ChatMessage =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as Record<string, unknown>).role === "string" &&
          typeof (m as Record<string, unknown>).content === "string"
      );
      if (validMessages.length > 0) {
        messages = validMessages;
      }
    } else if (
      typeof row.input === "object" &&
      row.input !== null &&
      "messages" in row.input &&
      Array.isArray((row.input as Record<string, unknown>).messages)
    ) {
      const nested = (row.input as Record<string, unknown>).messages as unknown[];
      const validMessages = nested.filter(
        (m): m is ChatMessage =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as Record<string, unknown>).role === "string" &&
          typeof (m as Record<string, unknown>).content === "string"
      );
      if (validMessages.length > 0) {
        messages = validMessages;
      }
    }

    if (messages.length > 0) {
      normalized.push({ id, messages });
    }
  }

  return normalized;
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

        const normalized = normalizeDatasetRows(rawRows);

        if (normalized.length === 0) {
          throw new Error(
            "No conversation rows found in dataset. Rows must contain messages with role and content fields."
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
