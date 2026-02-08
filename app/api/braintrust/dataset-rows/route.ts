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

  const datasetId = request.nextUrl.searchParams.get("datasetId");
  if (!datasetId) {
    return Response.json(
      { error: "Missing datasetId parameter" },
      { status: 400 }
    );
  }

  const limit = request.nextUrl.searchParams.get("limit") ?? "50";

  try {
    const response = await fetch(
      `${BRAINTRUST_API_URL}/dataset/${encodeURIComponent(datasetId)}/fetch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: parseInt(limit, 10) }),
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
    const rows = data.events ?? data.rows ?? data ?? [];

    return Response.json({ rows });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch dataset rows" },
      { status: 500 }
    );
  }
}
