import { describe, expect, test } from "bun:test";

import { createApp } from "../src/server";

interface DemoSignupResponse {
  developerSignup: Record<string, unknown>;
}

interface ValidationErrorResponse {
  error: string;
}

async function postDemoSignup(app: ReturnType<typeof createApp>, payload: unknown) {
  return app.fetch(
    new Request("http://localhost/demo-signups", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

describe("Demo Signup Payload intake", () => {
  test("accepts a dashboard form post and returns to the Lead Queue moment", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    const response = await app.fetch(
      new Request("http://localhost/demo-signups", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: "engineer@modal.com",
          name: "Ada Lovelace",
        }),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?view=queue");
  });

  test("accepts a corporate-looking Developer Signup and shows it in the Apex Dashboard", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "Engineer@Modal.com",
      name: "Ada Lovelace",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.developerSignup).toMatchObject({
      email: "engineer@modal.com",
      source: "demo",
      name: "Ada Lovelace",
      signedUpAt: "2026-05-01T10:00:00.000Z",
      normalizedCompanyDomain: "modal.com",
      qualification: "qualified",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("engineer@modal.com");
    expect(html).toContain("modal.com");
    expect(html).toContain("Eligible for enrichment");
  });

  test("rejects a malformed Demo Signup Payload email without creating a record", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "not-an-email",
    });
    const body = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Demo Signup Payload email must be a valid email address.",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).not.toContain("not-an-email");
  });

  test("records a personal-domain Developer Signup as an Unqualified Signup", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "founder@gmail.com",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.developerSignup).toMatchObject({
      email: "founder@gmail.com",
      normalizedCompanyDomain: "gmail.com",
      qualification: "unqualified",
      unqualifiedReason: "personal-domain",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("founder@gmail.com");
    expect(html).toContain("Unqualified Signup");
    expect(html).toContain("personal-domain");
  });

  test("records an educational-domain Developer Signup as an Unqualified Signup", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "researcher@stanford.edu",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.developerSignup).toMatchObject({
      email: "researcher@stanford.edu",
      normalizedCompanyDomain: "stanford.edu",
      qualification: "unqualified",
      unqualifiedReason: "educational-domain",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("researcher@stanford.edu");
    expect(html).toContain("educational-domain");
  });

  test("records a disposable-domain Developer Signup as an Unqualified Signup", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "demo@mailinator.com",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.developerSignup).toMatchObject({
      email: "demo@mailinator.com",
      normalizedCompanyDomain: "mailinator.com",
      qualification: "unqualified",
      unqualifiedReason: "disposable-domain",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("demo@mailinator.com");
    expect(html).toContain("disposable-domain");
  });

  test("records an ambiguous-domain Developer Signup as an Unqualified Signup", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "analyst@internal",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.developerSignup).toMatchObject({
      email: "analyst@internal",
      normalizedCompanyDomain: "internal",
      qualification: "unqualified",
      unqualifiedReason: "ambiguous-domain",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("analyst@internal");
    expect(html).toContain("ambiguous-domain");
  });
});
