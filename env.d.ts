/* eslint-disable */
// Type declarations for Cloudflare Worker environment bindings.
// Regenerate with: wrangler types env.d.ts --include-runtime false
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/server");
    durableNamespaces: "SessionAgent";
  }
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    REPORTS: R2Bucket;
    AI: Ai;
    ELEVENLABS_API_KEY: string;
    ELEVENLABS_AGENT_ID: string;
    GOOGLE_AI_API_KEY: string;
    SessionAgent: DurableObjectNamespace<
      import("./src/server").SessionAgent
    >;
  }
}
interface Env extends Cloudflare.Env {}
