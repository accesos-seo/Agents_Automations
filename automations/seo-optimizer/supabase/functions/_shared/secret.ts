// _shared/secret.ts
// Verifica el header x-internal-secret contra SEO_OPTIMIZER_INTERNAL_SECRET.
// Todas las Edge Functions (excepto health/manual) deben llamar verifySecret(req).

export function verifySecret(req: Request): Response | null {
  const expected = Deno.env.get("SEO_OPTIMIZER_INTERNAL_SECRET");
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "SEO_OPTIMIZER_INTERNAL_SECRET not configured in env" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const got = req.headers.get("x-internal-secret");
  if (!got) {
    return new Response(
      JSON.stringify({ error: "missing x-internal-secret header" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  // Constant-time compare to avoid timing attacks
  if (!constantTimeEqual(got, expected)) {
    return new Response(
      JSON.stringify({ error: "invalid x-internal-secret" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return null; // OK
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
