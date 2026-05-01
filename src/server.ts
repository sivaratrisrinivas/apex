import { renderDashboard } from "./dashboard";

export interface ApexApp {
  fetch(request: Request): Response | Promise<Response>;
}

export function createApp(): ApexApp {
  return {
    fetch(request: Request): Response {
      const url = new URL(request.url);

      if (url.pathname !== "/") {
        return new Response("Not found", { status: 404 });
      }

      return new Response(renderDashboard(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    },
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();

  Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Apex running at http://localhost:${port}`);
}
