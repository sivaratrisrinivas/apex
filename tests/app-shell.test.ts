import { describe, expect, test } from "bun:test";

import { createApp } from "../src/server";

describe("Apex Dashboard shell", () => {
  test("serves the Apex Dashboard from the root route", async () => {
    const app = createApp();

    const response = await app.fetch(new Request("http://localhost/"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Apex");
    expect(html).toContain("Lead Queue");
    expect(html).toContain("WSL local");
  });

  test("returns not found for unknown routes", async () => {
    const app = createApp();

    const response = await app.fetch(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
  });
});
