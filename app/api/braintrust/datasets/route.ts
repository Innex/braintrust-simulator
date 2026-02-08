import { NextRequest } from "next/server";

const BRAINTRUST_API_URL = process.env.BRAINTRUST_API_URL || "https://api.braintrust.dev/v1";

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-bt-api-key");

  if (!apiKey) {
    return Response.json(
      { error: "Missing Braintrust API key" },
      { status: 401 }
    );
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return Response.json(
      { error: "Missing projectId parameter" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${BRAINTRUST_API_URL}/dataset?project_id=${encodeURIComponent(projectId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return Response.json(
        { error: `Braintrust API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const datasets = data.objects ?? data ?? [];

    return Response.json({ datasets });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch datasets" },
      { status: 500 }
    );
  }
}
