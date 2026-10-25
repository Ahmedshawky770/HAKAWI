/**
 * Kubernetes liveness/readiness probe endpoint.
 *
 * Low-overhead system sanity reporting: no database, no Valkey, no external
 * calls — just confirms the Next.js process is serving HTTP. Returns 200 OK
 * with a structured JSON body so the Helm chart's livenessProbe and
 * readinessProbe (configured at `infrastructure/helm/frontend/values.yaml`)
 * mark the Pod healthy instead of entering an infinite rolling loop.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: "ok",
      service: "hakawi-frontend",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
