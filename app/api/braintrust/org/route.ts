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

  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return Response.json(
      { error: "Missing orgId parameter" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${BRAINTRUST_API_URL}/organization/${encodeURIComponent(orgId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");

      // The 403 error message contains the org name in [user_org=X] format
      if (response.status === 403) {
        const match = errorText.match(/\[user_org=([^\]]+)\]/);
        if (match) {
          return Response.json({ orgName: match[1] });
        }
      }

      return Response.json(
        { error: `Braintrust API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return Response.json({ orgName: data.name });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch organization" },
      { status: 500 }
    );
  }
}
