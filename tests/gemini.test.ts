import { describe, expect, test } from "bun:test";

import { createGeminiDraftWriter } from "../src/gemini";
import type { CompanyEnrichment } from "../src/signups";

describe("Gemini outreach drafts", () => {
  test("uses plain text body generation instead of parsing Gemini JSON", async () => {
    const responses = [
      '{"subject":"Granola follow up","body":"Hi Granola.ai team,',
      [
        "Hi Granola.ai team,",
        "",
        "A developer from granola.ai signed up for Parallel, and the timing looks interesting.",
        "Parallel can help turn that signal into a grounded account narrative.",
      ].join("\n"),
    ];
    const prompts: string[] = [];
    const responseMimeTypes: Array<string | undefined> = [];
    const writer = createGeminiDraftWriter({
      apiKey: "gemini_test_key",
      generateContent: async (request) => {
        const typedRequest = request as {
          contents: string;
          config?: { responseMimeType?: string };
        };
        prompts.push(typedRequest.contents);
        responseMimeTypes.push(typedRequest.config?.responseMimeType);

        return {
          text: responses.shift(),
        };
      },
    });

    const draft = await writer(granolaEnrichment());

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Return plain text only");
    expect(prompts[0]).toContain("Do not return JSON");
    expect(prompts[1]).toContain("Do not return JSON");
    expect(prompts[1]).toContain("Keep it to 5 sentences max");
    expect(responseMimeTypes).toEqual(["text/plain", "text/plain"]);
    expect(draft).toMatchObject({
      status: "ready",
      subject: "Granola.ai's AI workflow story",
    });
    expect(draft.body).toContain("A developer from granola.ai signed up for Parallel");
  });
});

function granolaEnrichment(): CompanyEnrichment {
  return {
    id: "company_enrichment_1",
    companyId: "company_1",
    enrichmentRunId: "enrichment_run_1",
    normalizedCompanyDomain: "granola.ai",
    status: "completed",
    companyName: "Granola.ai",
    createdAt: "2026-05-01T10:00:00.000Z",
    content: {
      company: {
        name: "Granola.ai",
        domain: "granola.ai",
        headquarters: "London, United Kingdom",
        employeeRange: "104",
      },
      funding: {
        stage: "Series C",
        totalRaised: "$192 million",
        latestRound: "Series C",
        latestRoundDate: "2026-05-01",
      },
      technicalSignals: {
        aiWorkloads: "AI meeting notes and conversational context workflows.",
        computeIntensity: "High",
        developerToolRelevance: "Personal and Enterprise APIs plus integrations with developer tools.",
      },
      salesSignals: {
        keyReasons: [
          "Recent Series C funding",
          "AI-centric meeting-note platform",
          "Personal and Enterprise APIs",
        ],
        suggestedNextAction: "Explore workflow automation opportunities.",
      },
      confidence: {
        evidenceConfidence: "High",
        notes: "Evidence-backed enrichment.",
      },
      outreachSeed: {
        personalizationAngles: [
          "Granola.ai helps teams organize conversational context, generate insights, and automate post-meeting workflows.",
        ],
        warnings: [],
      },
    },
    evidenceBasis: [
      {
        field: "technicalSignals.aiWorkloads",
        confidence: "high",
        reasoning: "Granola.ai describes AI meeting note workflows.",
        citations: [
          {
            title: "Granola product",
            url: "https://granola.ai",
            excerpts: ["AI meeting notes"],
          },
        ],
      },
    ],
  };
}
