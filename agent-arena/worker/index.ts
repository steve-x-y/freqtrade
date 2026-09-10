/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_event: unknown, bindings: Env, ctx: ExecutionContext) {
    // Opt-in via an independently managed Cloudflare Cron Trigger. Sites does not install one.
    ctx.waitUntil((async () => {
      const { POST } = await import('../app/api/arena/route');
      const rows = await bindings.DB.prepare("SELECT owner FROM arenas WHERE json_extract(state,'$.running')=1 LIMIT 10").all<{owner:string}>();
      for (const row of rows.results) {
        const response = await POST(new Request('https://arena.internal/api/arena', {
          method:'POST', headers:{'Content-Type':'application/json',Origin:'https://arena.internal','oai-authenticated-user-id':row.owner},body:JSON.stringify({action:'tick'})
        }));
        // Do not log user IDs, account keys, market prompts or provider responses.
        if (!response.ok) console.warn('Scheduled arena cycle skipped', response.status);
      }
    })());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
