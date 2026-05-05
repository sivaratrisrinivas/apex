import { GoogleGenAI } from "@google/genai";
import type { CompanyEnrichment, EvidenceBasisItem } from "./signups";

/**
 * The shape returned by a draft writer — either Gemini or the template fallback.
 */
export interface OutreachDraftContent {
  status: "ready" | "needs-evidence";
  subject: string;
  body: string;
  evidenceReferences: string[];
}

/**
 * An async function that generates an outreach draft from enrichment data.
 * When undefined, the synchronous template fallback is used.
 */
export type OutreachDraftWriter = (
  companyEnrichment: CompanyEnrichment,
) => Promise<OutreachDraftContent>;

const OUTREACH_SYSTEM_PROMPT = `You are an expert B2B sales development representative writing a short, personalized outreach email on behalf of Parallel — a developer infrastructure company that helps teams turn research and enrichment workflows into reliable API-backed automation.

You will receive structured company enrichment data including:
- Company details (name, domain, headquarters, employee count)
- Funding information (stage, total raised)
- Technical signals (AI workloads, compute intensity, developer tool relevance)
- Sales signals (key reasons, suggested next action)
- Evidence basis with citations
- Outreach seed with personalization angles

Your task is to write a concise, compelling outreach email that:
1. Opens with a specific, researched observation about the company (NOT generic flattery)
2. Connects their technical signals to Parallel's value proposition naturally
3. References specific evidence from the enrichment data to show genuine research
4. Ends with a low-friction call to action (not a hard sell)
5. Is 4-6 sentences max in the body — brevity is a feature

Style guidelines:
- Write like a thoughtful human, not a sales bot
- No buzzwords like "synergy", "leverage", "game-changer"
- No exclamation marks
- Be specific: cite real data from the enrichment (funding, compute signals, etc.)
- Sound curious and helpful, not pushy`;

const OUTREACH_USER_PROMPT_TEMPLATE = `Generate an outreach email for the following company. Return ONLY valid JSON with this exact shape:
{
  "subject": "short, specific subject line (no generic 'partnership' or 'intro' subjects)",
  "body": "the email body text, use \\n for newlines"
}

Company Enrichment Data:
\`\`\`json
{enrichment_json}
\`\`\`

Evidence Basis:
\`\`\`json
{evidence_json}
\`\`\`

Remember: Return ONLY the JSON object, no markdown fencing, no explanation.`;

/**
 * Creates a Gemini-powered outreach draft writer.
 */
export function createGeminiDraftWriter(options: {
  apiKey: string;
  model?: string;
}): OutreachDraftWriter {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model ?? "gemini-3-flash-preview";

  return async (companyEnrichment: CompanyEnrichment): Promise<OutreachDraftContent> => {
    const { content, evidenceBasis } = companyEnrichment;
    const evidenceReferences = evidenceBasis.map(formatEvidenceReference);

    // Check if evidence is too weak for a personalized draft
    const confidence = content.confidence.evidenceConfidence.trim().toLowerCase();
    if (
      evidenceReferences.length === 0 ||
      confidence.includes("low") ||
      confidence.includes("unknown")
    ) {
      console.log(`[apex]   → [Gemini] Skipping LLM — weak evidence (${confidence}), using template fallback`);
      return {
        status: "needs-evidence",
        subject: `Follow up with ${content.company.domain}`,
        body: [
          `Hi ${content.company.name} team,`,
          "",
          `A developer from ${content.company.domain} signed up for Parallel.`,
          "I do not yet have enough Evidence Basis to personalize this confidently, so I would keep the first touch exploratory.",
          "",
          `Suggested next action: ${content.salesSignals.suggestedNextAction}`,
        ].join("\n"),
        evidenceReferences,
      };
    }

    console.log(`[apex]   → [Gemini] Generating outreach draft with ${model}...`);
    const startTime = Date.now();

    try {
      const userPrompt = OUTREACH_USER_PROMPT_TEMPLATE
        .replace("{enrichment_json}", JSON.stringify(content, null, 2))
        .replace("{evidence_json}", JSON.stringify(evidenceBasis, null, 2));

      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: OUTREACH_SYSTEM_PROMPT,
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      });

      const elapsed = Date.now() - startTime;
      const rawText = response.text?.trim() ?? "";

      console.log(`[apex]   → [Gemini] Response received in ${elapsed}ms (${rawText.length} chars)`);

      // Parse the JSON response — strip markdown fencing if present
      const jsonText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(jsonText) as { subject: string; body: string };

      if (!parsed.subject || !parsed.body) {
        throw new Error("Gemini response missing subject or body fields");
      }

      console.log(`[apex]   ✓ [Gemini] Draft generated: "${parsed.subject}"`);

      return {
        status: "ready",
        subject: parsed.subject,
        body: parsed.body,
        evidenceReferences,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`[apex]   ✗ [Gemini] Failed after ${elapsed}ms: ${reason}`);
      console.log(`[apex]   → [Gemini] Falling back to template draft`);

      // Fall back to template
      return buildTemplateDraft(content, evidenceReferences);
    }
  };
}

/**
 * Template-based fallback (the original logic, extracted for reuse).
 */
function buildTemplateDraft(
  content: CompanyEnrichment["content"],
  evidenceReferences: string[],
): OutreachDraftContent {
  const primaryAngle =
    content.outreachSeed.personalizationAngles[0] ??
    content.salesSignals.keyReasons[0] ??
    "developer infrastructure";
  const evidenceLine =
    evidenceReferences.length > 0
      ? `Evidence used: ${evidenceReferences.join("; ")}.`
      : "Evidence used: none returned yet.";

  return {
    status: "ready",
    subject: `${content.company.name} and Parallel`,
    body: [
      `Hi ${content.company.name} team,`,
      "",
      `I noticed ${content.company.name}'s work around ${primaryAngle}. Parallel helps teams turn research and enrichment workflows into reliable API-backed automation.`,
      "",
      `Apex flagged this Lead because ${content.salesSignals.keyReasons.join(", ")}.`,
      evidenceLine,
      `Suggested next action: ${content.salesSignals.suggestedNextAction}`,
    ].join("\n"),
    evidenceReferences,
  };
}

function formatEvidenceReference(item: EvidenceBasisItem): string {
  const firstCitation = item.citations[0];
  return firstCitation
    ? `${item.field}: ${firstCitation.title}`
    : item.field;
}
