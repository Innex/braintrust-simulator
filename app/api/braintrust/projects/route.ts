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

  try {
    const response = await fetch(`${BRAINTRUST_API_URL}/project`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return Response.json(
        { error: `Braintrust API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    const projects = data.objects ?? data ?? [];

    return Response.json({ projects });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
