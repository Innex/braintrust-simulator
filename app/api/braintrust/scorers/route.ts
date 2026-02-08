import { NextRequest } from "next/server";

const BRAINTRUST_API_URL = process.env.BRAINTRUST_API_URL || "https://api.braintrust.dev/v1";

interface BraintrustScorer {
  id?: string;
  name: string;
  description?: string;
}

const BUILTIN_SCORERS = [
  {
    id: "autoevals-factuality",
    name: "Factuality",
    description: "Evaluates whether the response is factually consistent with the context",
    type: "autoevals" as const,
  },
  {
    id: "autoevals-helpfulness",
    name: "Helpfulness",
    description: "Evaluates how helpful the response is to the user",
    type: "autoevals" as const,
  },
  {
    id: "autoevals-relevance",
    name: "Relevance",
    description: "Evaluates whether the response is relevant to the query",
    type: "autoevals" as const,
  },
  {
    id: "autoevals-coherence",
    name: "Coherence",
    description: "Evaluates the logical coherence of the response",
    type: "autoevals" as const,
  },
];

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-bt-api-key");
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!apiKey) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }

  if (!projectId) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }

  const allScorers = [...BUILTIN_SCORERS];

  try {
    const response = await fetch(
      `${BRAINTRUST_API_URL}/project/${projectId}/scores`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const onlineScorers = (data.objects || data || []).map((scorer: BraintrustScorer) => ({
        id: scorer.id || scorer.name,
        name: scorer.name,
        description: scorer.description || "",
        type: "online" as const,
      }));
      allScorers.push(...onlineScorers);
    }
  } catch (error) {
    console.error("Error fetching online scorers:", error);
  }

  return Response.json({ scorers: allScorers });
}
