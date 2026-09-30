import { lookupHistory } from "@/lib/lookup";

export async function GET(request: Request) {
  const { status, body } = await lookupHistory(new URL(request.url).searchParams.get("symbol") ?? "");
  return Response.json(body, {
    status,
    headers: status === 200 ? { "Cache-Control": "public, max-age=3600, s-maxage=43200" } : undefined,
  });
}
