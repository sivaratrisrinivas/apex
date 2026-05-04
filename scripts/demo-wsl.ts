import { createApp } from "../src/server";

type ApexApp = ReturnType<typeof createApp>;

interface DemoSignupResponse {
  developerSignup?: {
    email: string;
    normalizedCompanyDomain: string;
  };
  enrichmentRun?: {
    status: string;
  };
}

interface OutreachDraftResponse {
  outreachDraft?: {
    status: string;
    subject: string;
    body: string;
    evidenceReferences: string[];
  };
}

const DEMO_EMAIL = "engineer@modal.com";
const DEMO_SIGNED_UP_AT = "2026-05-01T10:00:00.000Z";
const MODAL_EVIDENCE_REFERENCE =
  "technicalSignals.computeIntensity: Modal infrastructure overview";

async function main() {
  const app = createApp({
    env: {
      APEX_ENRICHMENT_MODE: "fake",
    },
  });

  const signupResponse = await postJson(app, "/demo-signups", {
    email: DEMO_EMAIL,
    name: "Ada Lovelace",
    signedUpAt: DEMO_SIGNED_UP_AT,
  });
  assertResponseStatus(signupResponse, 201, "Demo Signup Payload was accepted");
  const signupBody = (await signupResponse.json()) as DemoSignupResponse;
  const developerSignup = signupBody.developerSignup;
  const enrichmentRun = signupBody.enrichmentRun;

  assert(
    developerSignup?.email === DEMO_EMAIL,
    "Demo Signup Payload did not create the expected Developer Signup.",
  );
  assert(
    developerSignup.normalizedCompanyDomain === "modal.com",
    "Demo Signup Payload did not normalize the Company domain.",
  );
  assert(
    enrichmentRun?.status === "pending",
    "Demo Signup Payload did not acknowledge a pending Enrichment Run.",
  );

  console.log(`Demo Signup Payload: ${developerSignup.email}`);
  console.log(`Near-Real-Time Enrichment: ${enrichmentRun.status}`);

  await waitForBackgroundWork();

  const dashboardHtml = await fetchText(app, "/");
  assertContains(dashboardHtml, "Modal Labs", "Lead Queue did not show Modal Labs.");
  assertContains(dashboardHtml, "<b>93</b>", "Lead Queue did not show the expected Lead Score.");
  assertContains(
    dashboardHtml,
    'data-status="completed">completed</mark>',
    "Lead Queue did not show completed enrichment.",
  );
  assertContains(
    dashboardHtml,
    "technicalSignals.computeIntensity",
    "Lead detail did not show the Evidence Basis field.",
  );
  assertContains(
    dashboardHtml,
    "Serverless infrastructure for AI workloads.",
    "Lead detail did not show the expected evidence snippet.",
  );

  console.log("Lead Queue: Modal Labs scored 93");
  console.log("Evidence Basis: technicalSignals.computeIntensity");

  const outreachResponse = await postJson(app, "/outreach-drafts", {
    normalizedCompanyDomain: developerSignup.normalizedCompanyDomain,
  });
  assertResponseStatus(outreachResponse, 201, "Outreach Draft was generated");
  const outreachBody = (await outreachResponse.json()) as OutreachDraftResponse;
  const outreachDraft = outreachBody.outreachDraft;

  assert(outreachDraft, "Outreach Draft response did not include a draft.");
  assert(
    outreachDraft.status === "ready",
    "Outreach Draft was not ready despite strong Evidence Basis.",
  );
  assertContains(
    outreachDraft.body,
    "AI infrastructure scaling",
    "Outreach Draft did not use the evidence-backed personalization angle.",
  );
  assert(
    outreachDraft.evidenceReferences.includes(MODAL_EVIDENCE_REFERENCE),
    "Outreach Draft did not cite the Evidence Basis it used.",
  );

  const selectedLeadHtml = await fetchText(app, "/?lead=modal.com");
  assertContains(
    selectedLeadHtml,
    "Outreach Draft",
    "Selected Lead detail did not present the Outreach Draft.",
  );
  assertContains(
    selectedLeadHtml,
    "data-copy-outreach",
    "Selected Lead detail did not expose the copyable Outreach Draft action.",
  );

  console.log(`Outreach Draft: ${outreachDraft.status}`);
  console.log(MODAL_EVIDENCE_REFERENCE);
  console.log("Apex WSL demo complete");
}

async function postJson(
  app: ApexApp,
  pathname: string,
  payload: unknown,
): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

async function fetchText(app: ApexApp, pathname: string): Promise<string> {
  const response = await app.fetch(new Request(`http://localhost${pathname}`));
  assertResponseStatus(response, 200, `GET ${pathname} succeeded`);

  return response.text();
}

async function waitForBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function assertResponseStatus(
  response: Response,
  expectedStatus: number,
  message: string,
) {
  assert(
    response.status === expectedStatus,
    `${message}. Expected ${expectedStatus}, received ${response.status}.`,
  );
}

function assertContains(value: string, expected: string, message: string) {
  assert(value.includes(expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(formatErrorMessage(error));
  process.exitCode = 1;
});

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `Apex WSL demo failed: ${error.message}`;
  }

  return "Apex WSL demo failed.";
}
