import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const route = path.join("/");
  if (
    !/^(config|projects|tasks|tasks\/[\da-f-]{36}(\/messages)?|proposals\/[\da-f-]{36}\/(confirm|reject)|evaluations)$/.test(
      route
    )
  )
    return NextResponse.json({ message: "Unknown route" }, { status: 404 });
  // Mutations must originate from this app, not a cross-origin HTML form.
  if (req.method === "POST" && req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { message: "Invalid request origin" },
      { status: 403 }
    );
  const token = process.env.AI_WORKSPACE_TOKEN;
  if (!token)
    return NextResponse.json(
      {
        message:
          "Set AI_WORKSPACE_TOKEN in frontend .env.local and backend .env",
      },
      { status: 503 }
    );
  try {
    const base = (
      process.env.BACKEND_API_URL ?? "http://127.0.0.1:3001/api"
    ).replace(/\/$/, "");
    const res = await fetch(`${base}/agent/${route}`, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: req.method === "POST" ? await req.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "Backend unavailable. Check BACKEND_API_URL and start the backend.",
      },
      { status: 502 }
    );
  }
}
export { proxy as GET, proxy as POST };
