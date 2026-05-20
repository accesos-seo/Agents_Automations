export function verifyInternalSecret(req: Request): Response | null {
  const provided = req.headers.get("x-internal-secret");
  const expected = Deno.env.get("OEW_INTERNAL_SECRET");
  if (!expected || provided !== expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
