import { renderDashboard } from "./dashboard";
import { PrototypeStore } from "./signups";

export interface ApexApp {
  fetch(request: Request): Response | Promise<Response>;
}

export function createApp(): ApexApp {
  const store = new PrototypeStore();

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === "/" && request.method === "GET") {
        return new Response(
          renderDashboard({
            developerSignups: store.listDeveloperSignups(),
          }),
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      if (url.pathname === "/demo-signups" && request.method === "POST") {
        const result = store.createDeveloperSignup(await readJsonPayload(request));

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

        return jsonResponse(
          {
            developerSignup: result.developerSignup,
          },
          201,
        );
      }

      return new Response("Not found", { status: 404 });
    },
  };
}

async function readJsonPayload(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
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
