import { NextRequest } from "next/server";

async function fetchList(
  serverUrl: string,
  apiKey: string,
  orgName?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (orgName) {
    headers["x-bt-org-name"] = orgName;
  }
  return fetch(`${serverUrl}/list`, { headers });
}

function parseOrgNameFromError(errorText: string): string | null {
  try {
    const errorJson = JSON.parse(errorText);
    const message: string = errorJson.error?.message ?? "";

    // "Org 'X' is not allowed. Only org 'Y' is allowed."
    const onlyMatch = message.match(/Only org '([^']+)' is allowed/);
    if (onlyMatch) {
      return onlyMatch[1];
    }
  } catch {
    // not JSON
  }
  return null;
}

interface EvalEntry {
  scores?: Array<{ name: string }>;
  parameters?: Record<string, unknown>;
}

function parseEvalMap(evalMap: Record<string, unknown>) {
  const evalNames = Object.keys(evalMap);
  const evalScorers: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(evalMap)) {
    const entry = value as EvalEntry;
    if (entry?.scores && Array.isArray(entry.scores)) {
      evalScorers[name] = entry.scores.map((s) => s.name);
    }
  }
  return { evalNames, evalScorers };
}

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-bt-api-key");

  if (!apiKey) {
    return Response.json(
      { error: "Missing Braintrust API key" },
      { status: 401 }
    );
  }

  const serverUrl = request.nextUrl.searchParams.get("serverUrl");
  if (!serverUrl) {
    return Response.json(
      { error: "Missing serverUrl parameter" },
      { status: 400 }
    );
  }

  const orgName = request.nextUrl.searchParams.get("orgName");

  try {
    let response = await fetchList(serverUrl, apiKey, orgName ?? undefined);

    // If the server requires an org name and we didn't send one (or sent the wrong one),
    // try to auto-detect from the error response and retry.
    if (!response.ok && (response.status === 400 || response.status === 403)) {
      const errorText = await response.text().catch(() => "");
      const detectedOrg = parseOrgNameFromError(errorText);

      if (detectedOrg) {
        response = await fetchList(serverUrl, apiKey, detectedOrg);
        if (response.ok) {
          const evalMap: Record<string, unknown> = await response.json();
          const { evalNames, evalScorers } = parseEvalMap(evalMap);
          return Response.json({ evalNames, evalScorers, orgName: detectedOrg });
        }
      }

      // If we still failed, check if the error is "Missing x-bt-org-name header".
      // That means the server requires one but didn't tell us which — try a dummy
      // request with a placeholder to get the "Only org 'X'" error.
      if (!detectedOrg) {
        try {
          const errorJson = JSON.parse(errorText);
          const message: string = errorJson.error?.message ?? "";
          if (message.includes("x-bt-org-name")) {
            const probeResponse = await fetchList(serverUrl, apiKey, "__probe__");
            if (!probeResponse.ok) {
              const probeText = await probeResponse.text().catch(() => "");
              const probedOrg = parseOrgNameFromError(probeText);
              if (probedOrg) {
                response = await fetchList(serverUrl, apiKey, probedOrg);
                if (response.ok) {
                  const evalMap: Record<string, unknown> = await response.json();
                  const { evalNames, evalScorers } = parseEvalMap(evalMap);
                  return Response.json({ evalNames, evalScorers, orgName: probedOrg });
                }
              }
            }
          }
        } catch {
          // fall through to error
        }
      }

      let errorMessage = `Dev server error: ${response.status}`;
      try {
        const finalErrorText = await response.text().catch(() => errorText);
        const errorJson = JSON.parse(finalErrorText || errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // use default
      }
      return Response.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      let errorMessage = `Dev server error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // use default
      }
      return Response.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const evalMap: Record<string, unknown> = await response.json();
    const { evalNames, evalScorers } = parseEvalMap(evalMap);

    return Response.json({ evalNames, evalScorers, orgName: orgName ?? null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to connect to dev server" },
      { status: 500 }
    );
  }
}
