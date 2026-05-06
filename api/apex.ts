import { waitUntil } from "@vercel/functions";

import { createApp } from "../src/server";
import { PrototypeStore } from "../src/signups";
import { VercelBlobSnapshotStore } from "../src/vercel-blob-store";

export default {
  async fetch(request: Request): Promise<Response> {
    const prototypeStore = new PrototypeStore();
    const blobStore = process.env.BLOB_READ_WRITE_TOKEN
      ? new VercelBlobSnapshotStore()
      : null;
    const snapshot = await blobStore?.load();

    if (snapshot) {
      prototypeStore.restoreSnapshot(snapshot);
    }

    const app = createApp({
      store: prototypeStore,
      env: process.env,
      recoverActiveRuns: false,
      deferTask(task) {
        const deferred = task().catch((error) => {
          console.error("[apex] Deferred Vercel task failed:", error);
        });

        waitUntil(deferred);
      },
      async onStoreChanged() {
        await blobStore?.save(prototypeStore.createSnapshot());
      },
    });

    return app.fetch(rewriteVercelRequest(request));
  },
};

function rewriteVercelRequest(request: Request): Request {
  const url = new URL(request.url);
  const apexPath = url.searchParams.get("apexPath");

  if (apexPath === null) {
    return request;
  }

  url.pathname = apexPath.trim().length > 0 ? `/${apexPath}` : "/";
  url.searchParams.delete("apexPath");

  return new Request(url.toString(), request);
}
