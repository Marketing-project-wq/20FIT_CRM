/**
 * Next.js boot hook. The warmer lives in instrumentation-node.ts and is imported ONLY for the nodejs
 * runtime (Next inlines NEXT_RUNTIME, so the edge bundle never pulls in server-only modules).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
