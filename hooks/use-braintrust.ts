"use client";

import { useState, useCallback } from "react";
import { type BraintrustProject, type BraintrustDataset, type Scorer } from "@/lib/types";

export function useBraintrust(apiKey: string | null) {
  const [projects, setProjects] = useState<BraintrustProject[]>([]);
  const [datasets, setDatasets] = useState<BraintrustDataset[]>([]);
  const [scorers, setScorers] = useState<Scorer[]>([]);
  const [evalNames, setEvalNames] = useState<string[]>([]);
  const [evalScorers, setEvalScorers] = useState<Record<string, string[]>>({});
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [evalNamesLoading, setEvalNamesLoading] = useState(false);
  const [evalNamesError, setEvalNamesError] = useState<string | null>(null);
  const [scorersLoading, setScorersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveOrgName = useCallback(async (orgId: string) => {
    if (!apiKey || !orgId) return;

    try {
      const response = await fetch(`/api/braintrust/org?orgId=${encodeURIComponent(orgId)}`, {
        headers: { "x-bt-api-key": apiKey },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.orgName) {
          setOrgName(data.orgName);
        }
      }
    } catch {
      // org name resolution is best-effort
    }
  }, [apiKey]);

  const fetchProjects = useCallback(async () => {
    if (!apiKey) {
      setError("API key is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/braintrust/projects", {
        headers: {
          "x-bt-api-key": apiKey,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch projects: ${response.status}`);
      }

      const data = await response.json();
      const fetchedProjects = data.projects || [];
      setProjects(fetchedProjects);

      if (fetchedProjects.length > 0 && fetchedProjects[0].org_id && !orgName) {
        resolveOrgName(fetchedProjects[0].org_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey, orgName, resolveOrgName]);

  const fetchDatasets = useCallback(async (projectId: string) => {
    if (!apiKey || !projectId) {
      return;
    }

    setDatasetsLoading(true);

    try {
      const response = await fetch(`/api/braintrust/datasets?projectId=${projectId}`, {
        headers: {
          "x-bt-api-key": apiKey,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("Failed to fetch datasets:", data.error);
        setDatasets([]);
        return;
      }

      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (err) {
      console.error("Error fetching datasets:", err);
      setDatasets([]);
    } finally {
      setDatasetsLoading(false);
    }
  }, [apiKey]);

  const fetchEvalNames = useCallback(async (serverUrl: string) => {
    if (!apiKey || !serverUrl) {
      return;
    }

    setEvalNamesLoading(true);
    setEvalNamesError(null);

    try {
      const params = new URLSearchParams({ serverUrl });
      if (orgName) {
        params.set("orgName", orgName);
      }

      const response = await fetch(`/api/braintrust/eval-names?${params.toString()}`, {
        headers: {
          "x-bt-api-key": apiKey,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setEvalNamesError(data.error || `Failed to fetch eval names: ${response.status}`);
        setEvalNames([]);
        return;
      }

      const data = await response.json();
      setEvalNames(data.evalNames || []);
      setEvalScorers(data.evalScorers || {});
      if (data.orgName && !orgName) {
        setOrgName(data.orgName);
      }
    } catch (err) {
      setEvalNamesError(err instanceof Error ? err.message : "Failed to connect to dev server");
      setEvalNames([]);
    } finally {
      setEvalNamesLoading(false);
    }
  }, [apiKey, orgName]);

  const fetchScorers = useCallback(async (projectId: string) => {
    if (!apiKey || !projectId) {
      return;
    }

    setScorersLoading(true);

    try {
      const response = await fetch(`/api/braintrust/scorers?projectId=${projectId}`, {
        headers: {
          "x-bt-api-key": apiKey,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("Failed to fetch scorers:", data.error);
        setScorers([]);
        return;
      }

      const data = await response.json();
      setScorers(data.scorers || []);
    } catch (err) {
      console.error("Error fetching scorers:", err);
      setScorers([]);
    } finally {
      setScorersLoading(false);
    }
  }, [apiKey]);

  const validateApiKey = useCallback(async (): Promise<boolean> => {
    if (!apiKey) return false;

    try {
      const response = await fetch("/api/braintrust/projects", {
        headers: {
          "x-bt-api-key": apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [apiKey]);

  return {
    projects,
    datasets,
    evalNames,
    evalScorers,
    orgName,
    scorers,
    loading,
    datasetsLoading,
    evalNamesLoading,
    evalNamesError,
    scorersLoading,
    error,
    fetchProjects,
    fetchDatasets,
    fetchEvalNames,
    fetchScorers,
    validateApiKey,
  };
}
