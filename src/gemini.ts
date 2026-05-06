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

Your task is to write a concise, compelling outreach email that reads like a small sales story:
1. Start with the trigger: a developer from the company signed up for Parallel
2. Turn the trigger into a researched observation about the company's current technical story
3. Explain the business tension behind that story: research, account prioritization, and timing become hard to do manually
4. Make Parallel the natural next chapter: API-backed research and enrichment workflows that turn raw signals into grounded account narratives
5. End with a low-friction call to action (not a hard sell)
6. Is 5-7 sentences max in the body — concise, but with a clear narrative arc

Style guidelines:
- Write like a thoughtful human, not a sales bot
- No buzzwords like "synergy", "leverage", "game-changer"
- No exclamation marks
- Be specific: cite real data from the enrichment (funding, compute signals, etc.)
- Sound curious and helpful, not pushy
- Do not mention Apex
- Do not use internal labels like "Evidence used", "Suggested next action", or "Apex flagged"
- Do not invent names, customers, metrics, or technical claims not present in the enrichment data`;

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
          `A developer from ${content.company.domain} signed up for Parallel, which is a signal worth noticing but not enough evidence to personalize confidently.`,
          "I would treat this as the opening chapter: someone may be exploring how to turn research and enrichment into API-backed automation, but the right first move is to learn what workflow they are trying to improve.",
          content.salesSignals.suggestedNextAction,
          "If useful, I can share a lightweight example of how Parallel turns a raw signup into a researched account narrative.",
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
          temperature: 0.55,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
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
  const reasons = formatInlineList(content.salesSignals.keyReasons);
  const evidenceSignal =
    evidenceReferences[0] ?? content.technicalSignals.computeIntensity;

  return {
    status: "ready",
    subject: `${formatPossessive(content.company.name)} ${formatSubjectAngle(primaryAngle)} story`,
    body: [
      `Hi ${content.company.name} team,`,
      "",
      `A developer from ${content.company.domain} signed up for Parallel, and the timing looks interesting: ${content.company.name} is already telling a story around ${primaryAngle}.`,
      "That usually creates a second problem behind the product story: the GTM team needs to spot the right accounts, understand why the signal matters, and move fast without hand-building every brief.",
      "Parallel helps teams turn account research into API-backed workflows, so a signup like this can become a grounded account narrative instead of another row in a CRM.",
      `The strongest signal I found is ${evidenceSignal}, alongside ${reasons}.`,
      "Would it be worth comparing notes on how Parallel could help your team turn these research signals into cleaner sales motion?",
    ].join("\n"),
    evidenceReferences,
  };
}

function formatPossessive(value: string): string {
  return value.endsWith("s") ? `${value}'` : `${value}'s`;
}

function formatSubjectAngle(value: string): string {
  const trimmed = value.trim().replace(/\s+scaling$/i, "");

  return trimmed.length > 0 ? trimmed : "developer infrastructure";
}

function formatInlineList(values: string[]): string {
  const cleaned = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (cleaned.length === 0) {
    return "the signup activity";
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`;
}

function formatEvidenceReference(item: EvidenceBasisItem): string {
  const firstCitation = item.citations[0];
  return firstCitation
    ? `${item.field}: ${firstCitation.title}`
    : item.field;
}
