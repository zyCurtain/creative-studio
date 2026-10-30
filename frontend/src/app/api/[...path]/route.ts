import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
async function forward(req: NextRequest) {
  const base = process.env.BACKEND_URL ?? "http://localhost:8080";
  const headers = new Headers();
  for (const key of ["content-type", "cookie", "origin", "sec-fetch-site"]) {
    const value = req.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(
      `${base}${req.nextUrl.pathname}${req.nextUrl.search}`,
      {
        method: req.method,
        headers,
        body: req.method === "GET" ? undefined : await req.arrayBuffer(),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    const out = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const key of ["content-type", "set-cookie"]) {
      const value = response.headers.get(key);
      if (value) out.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: out,
    });
  } catch {
    return Response.json(
      { code: "BACKEND_UNAVAILABLE", message: "服务暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
export { forward as GET, forward as POST };
