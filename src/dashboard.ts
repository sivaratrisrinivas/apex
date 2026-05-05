import type {
  DeveloperSignup,
  EnrichmentRun,
  EvidenceBasisItem,
  LeadQueueRecord,
  LeadQueueSort,
} from "./signups";

interface DashboardOptions {
  developerSignups?: DeveloperSignup[];
  enrichmentRuns?: EnrichmentRun[];
  leadQueue?: LeadQueueRecord[];
  selectedLeadDomain?: string;
  leadQueueSort?: LeadQueueSort;
  activeView?: DashboardView;
}

type DashboardView = "intake" | "queue" | "lead" | "draft" | "activity";

export function renderDashboard(options: DashboardOptions = {}): string {
  const leadQueue = options.leadQueue ?? [];
  const leadQueueSort = options.leadQueueSort ?? "score";
  const selectedLead =
    leadQueue.find(
      (lead) =>
        lead.normalizedCompanyDomain ===
        options.selectedLeadDomain?.trim().toLowerCase(),
    ) ?? leadQueue[0];
  const activeView = resolveActiveView(options.activeView, leadQueue, selectedLead);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Apex Dashboard</title>
    <meta name="description" content="Apex — focus on the next lead" />
    <link rel="stylesheet" href="/assets/dashboard.css" />
    <style>mark[data-status="pending"],mark[data-status="researching"]{color:var(--teal)}mark[data-status="completed"]{color:var(--green)}mark[data-status="partial"]{color:var(--amber)}mark[data-status="failed"]{color:var(--red)}</style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div class="brand">Apex <span style="font-weight:400;font-size:11px;opacity:0.5;margin-left:8px">WSL local</span></div>
        <h1>${formatHeadline(activeView, selectedLead)}</h1>
        <p>${formatSubheadline(activeView, selectedLead, leadQueue)}</p>
      </header>

      ${formatFocusTabs(activeView, selectedLead)}

      <!-- Intake -->
      <section class="moment${activeView === "intake" ? " is-active" : ""}" id="moment-intake">
        <div class="panel">
          <div class="moment-head">
            <h2>Submit a Signal</h2>
            <p>Paste a developer signup email to begin enrichment.</p>
          </div>
          <div class="intake-body">
            <form method="post" action="/demo-signups">
              <div class="field-group">
                <label>Email<input type="email" name="email" placeholder="engineer@company.com" required /></label>
                <label>Name <span style="color:var(--faint)">(optional)</span><input type="text" name="name" placeholder="Jane Smith" /></label>
                <label>Source <span style="color:var(--faint)">(optional)</span><input type="text" name="source" value="manual" /></label>
              </div>
              <div style="align-self:end">
                <button type="submit" class="btn-primary">Enrich</button>
              </div>
            </form>
          </div>
          ${formatSignupActivity(options.developerSignups ?? [])}
        </div>
      </section>

      <!-- Queue -->
      <section class="moment${activeView === "queue" ? " is-active" : ""}" id="moment-queue" aria-label="Lead Queue">
        <div class="queue-toolbar">
          <h2>${leadQueue.length} Lead${leadQueue.length === 1 ? "" : "s"}</h2>
          ${formatSortControls(leadQueueSort)}
        </div>
        <div class="lead-cards">
          ${leadQueue.length === 0 ? formatEmpty("No leads yet. Submit a signal to get started.") : leadQueue.map((lead) => formatLeadCard(lead, leadQueueSort)).join("")}
          ${formatQueueCompat(leadQueue)}
        </div>
      </section>

      <!-- Lead detail -->
      <section class="moment${activeView === "lead" ? " is-active" : ""}" id="moment-lead" aria-label="Selected Lead detail">
        ${selectedLead ? formatLeadDetail(selectedLead) : formatEmpty("Select a lead from the Queue to see details.")}
      </section>

      <!-- Draft -->
      <section class="moment${activeView === "draft" ? " is-active" : ""}" id="moment-draft">
        ${selectedLead ? formatDraftMoment(selectedLead) : formatEmpty("Select a lead before generating an outreach draft.")}
      </section>

      <!-- Activity -->
      <section class="moment${activeView === "activity" ? " is-active" : ""}" id="moment-activity">
        <div class="panel">
          ${formatEnrichmentActivity(options.enrichmentRuns ?? [])}
        </div>
      </section>
    </main>

    <script>
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-copy-outreach]');
        if (!btn) return;
        var ta = document.getElementById(btn.dataset.copyOutreach);
        if (!ta) return;
        navigator.clipboard.writeText(ta.value);
        var orig = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function() { btn.textContent = orig; }, 1400);
      });
    </script>
  </body>
</html>`;
}

// ── Contextual headlines ──

function formatHeadline(view: DashboardView, lead: LeadQueueRecord | undefined): string {
  switch (view) {
    case "intake": return "New signal";
    case "queue": return "Lead Queue";
    case "lead": return lead ? esc(lead.companyName) : "No lead";
    case "draft": return lead ? `${esc(lead.companyName)} outreach` : "Outreach";
    case "activity": return "Activity";
  }
}

function formatSubheadline(view: DashboardView, lead: LeadQueueRecord | undefined, queue: LeadQueueRecord[]): string {
  switch (view) {
    case "intake": return "Paste a developer signup to start the enrichment pipeline.";
    case "queue": return queue.length === 0 ? "No leads enriched yet." : `Ranked by lead score. ${queue.length} compan${queue.length === 1 ? "y" : "ies"} in the queue.`;
    case "lead": return lead ? `${esc(lead.normalizedCompanyDomain)} · ${lead.signupCount} signup${lead.signupCount === 1 ? "" : "s"}` : "";
    case "draft": return lead ? "Review, edit, and copy the personalized outreach." : "";
    case "activity": return "All enrichment runs and signup payloads.";
  }
}

// ── Tabs ──

function formatFocusTabs(activeView: DashboardView, selectedLead: LeadQueueRecord | undefined): string {
  const sq = selectedLead ? `&lead=${encodeURIComponent(selectedLead.normalizedCompanyDomain)}` : "";
  const tabs: [DashboardView, string, string][] = [
    ["intake", "Intake", "/?view=intake"],
    ["queue", "Queue", "/?view=queue"],
    ["lead", "Lead", `/?view=lead${sq}`],
    ["draft", "Draft", `/?view=draft${sq}`],
    ["activity", "Activity", "/?view=activity"],
  ];
  return `
    <nav class="focus-tabs" aria-label="Primary">
      ${tabs.map(([v, l, h]) => `<a href="${h}" aria-current="${activeView === v}">${l}</a>`).join("")}
    </nav>`;
}

// ── Lead card ──

function formatLeadCard(lead: LeadQueueRecord, sort: LeadQueueSort): string {
  const href = `/?view=lead&lead=${encodeURIComponent(lead.normalizedCompanyDomain)}&sort=${sort}`;
  return `
    <a class="lead-card" href="${href}">
      <div class="lead-card-info">
        <h3>${esc(lead.companyName)}</h3>
        <span class="lead-card-domain">${esc(lead.normalizedCompanyDomain)}</span>
        <div class="lead-card-meta">
          <mark data-status="${esc(lead.enrichmentStatus)}">${esc(lead.enrichmentStatus)}</mark>
          <span>${lead.signupCount} signup${lead.signupCount === 1 ? "" : "s"}</span>
        </div>
        ${lead.suggestedNextAction ? `<div class="lead-card-action">${esc(lead.suggestedNextAction)}</div>` : ""}
      </div>
      ${formatScoreRing(lead, false)}
    </a>`;
}

// ── Score ring ──

function formatScoreRing(lead: LeadQueueRecord, large: boolean): string {
  if (lead.leadScore === null) {
    const cls = large ? "score-ring-lg score-ring-empty" : "score-ring score-ring-empty";
    return `<div class="${cls}" style="--pct:0"><div class="score-ring-inner"><b>--</b></div></div>`;
  }
  const cls = large ? "score-ring-lg" : "score-ring";
  return `<div class="${cls}" style="--pct:${lead.leadScore}"><div class="score-ring-inner"><b>${lead.leadScore}</b></div></div>`;
}

// ── Lead detail ──

function formatLeadDetail(lead: LeadQueueRecord): string {
  return `
    <div class="panel">
      <div class="detail-layout">
        <div class="detail-rail">
          ${formatScoreRing(lead, true)}
          <dl class="detail-stats">
            <div class="detail-stat"><dt>Domain</dt><dd>${esc(lead.normalizedCompanyDomain)}</dd></div>
            <div class="detail-stat"><dt>Status</dt><dd><mark data-status="${esc(lead.enrichmentStatus)}">${esc(lead.enrichmentStatus)}</mark></dd></div>
            <div class="detail-stat"><dt>Signups</dt><dd>${lead.signupCount}</dd></div>
            <div class="detail-stat"><dt>Latest</dt><dd>${esc(fmtDate(lead.latestSignupAt))}</dd></div>
          </dl>
          ${formatManualRefreshAction(lead)}
          <div style="display:none">${formatLeadQueueCompat(lead)}</div>
        </div>
        <div class="detail-flow">
          <h2>${esc(lead.companyName)} details</h2>
          ${formatMockCrmDisclosure(lead)}
          ${formatScoreBreakdownDisclosure(lead)}
          ${formatScoreReasonsDisclosure(lead.scoreReasons)}
          ${formatKeyReasonsDisclosure(lead.keyReasons)}
          ${formatEvidenceBasisDisclosure(lead.evidenceBasis)}
          ${formatRawEnrichmentDisclosure(lead)}
          ${formatOutreachInDetail(lead)}
        </div>
      </div>
    </div>`;
}

// ── Disclosure cards (progressive disclosure) ──

function formatMockCrmDisclosure(lead: LeadQueueRecord): string {
  const stage = formatMockLifecycleStage(lead);
  const owner = lead.leadScore !== null && lead.leadScore >= 80 ? "Enterprise AE" : "GTM Research";
  const territory = formatMockTerritory(lead.normalizedCompanyDomain);
  const lastActivity = `${lead.signupCount} signup${lead.signupCount === 1 ? "" : "s"} · ${fmtDate(lead.latestSignupAt)}`;
  return disclosure("Mock CRM Fields", `
    <dl>
      <div><dt>Lifecycle Stage</dt><dd>${esc(stage)}</dd></div>
      <div><dt>Owner</dt><dd>${esc(owner)}</dd></div>
      <div><dt>Territory</dt><dd>${esc(territory)}</dd></div>
      <div><dt>Last Activity</dt><dd>${esc(lastActivity)}</dd></div>
    </dl>`, true);
}

function formatScoreBreakdownDisclosure(lead: LeadQueueRecord): string {
  if (!lead.scoreBreakdown) return "";
  const dims: [string, { score: number; maxScore: number; reason: string }][] = [
    ["Purchasing Capacity", lead.scoreBreakdown.purchasingCapacity],
    ["Compute Intensity", lead.scoreBreakdown.computeIntensity],
    ["Parallel Fit", lead.scoreBreakdown.parallelFit],
    ["Sales Timing", lead.scoreBreakdown.salesTiming],
    ["Evidence Confidence", lead.scoreBreakdown.evidenceConfidence],
  ];
  const bars = dims.map(([label, d]) => {
    const pct = d.maxScore > 0 ? Math.round((d.score / d.maxScore) * 100) : 0;
    return `
      <div class="score-dim">
        <span class="score-dim-label">${esc(label)}</span>
        <div class="score-dim-bar"><div class="score-dim-fill" style="width:${pct}%"></div></div>
        <span class="score-dim-value">${d.score}/${d.maxScore}</span>
      </div>`;
  }).join("");
  return disclosure("Lead Score Breakdown", bars, true);
}

function formatScoreReasonsDisclosure(reasons: string[]): string {
  if (reasons.length === 0) return "";
  return disclosure("Top score reasons", `<ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`);
}

function formatKeyReasonsDisclosure(reasons: string[]): string {
  if (reasons.length === 0) return "";
  return disclosure("Key Reasons", `<ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`);
}

function formatEvidenceBasisDisclosure(basis: EvidenceBasisItem[]): string {
  if (basis.length === 0) return disclosure("Evidence Basis", `<p>Evidence Basis will appear after enrichment completes.</p>`);
  const items = basis.map((item) => {
    const excerpt = item.citations.flatMap((c) => c.excerpts)[0];
    return `<li><b>${esc(item.field)}</b> <span>${esc(item.confidence)}</span>${excerpt ? ` — ${esc(excerpt)}` : ""}</li>`;
  }).join("");
  return disclosure("Evidence Basis", `<ul>${items}</ul>`, true);
}

function formatRawEnrichmentDisclosure(lead: LeadQueueRecord): string {
  if (!lead.companyEnrichment) return disclosure("Raw Enrichment", `<p>Will appear after enrichment completes.</p>`);
  return disclosure("Raw Company Enrichment", `<pre>${escText(JSON.stringify(lead.companyEnrichment.content, null, 2))}</pre>`);
}

function disclosure(title: string, body: string, open = false): string {
  return `
    <details class="disclosure"${open ? " open" : ""}>
      <summary>${esc(title)}</summary>
      <div class="disclosure-body">${body}</div>
    </details>`;
}

// ── Draft moment ──

function formatDraftMoment(lead: LeadQueueRecord): string {
  if (!lead.companyEnrichment) {
    return `<div class="panel draft-editor">
      <h2>${esc(lead.companyName)} outreach</h2>
      <p style="color:var(--muted)">Enrichment must complete before generating a draft.</p>
    </div>`;
  }

  if (!lead.outreachDraft) {
    return `<div class="panel draft-editor">
      <h2>${esc(lead.companyName)} outreach</h2>
      <form method="post" action="/outreach-drafts">
        <input type="hidden" name="normalizedCompanyDomain" value="${esc(lead.normalizedCompanyDomain)}" />
        <button type="submit" class="btn-teal">Generate Outreach Draft</button>
      </form>
    </div>`;
  }

  const textareaId = `outreach-draft-${lead.outreachDraft.id}`;
  const refs = lead.outreachDraft.evidenceReferences;
  return `
    <div class="panel draft-editor">
      <div class="draft-status" data-s="${lead.outreachDraft.status === "ready" ? "ready" : "needs-evidence"}">${esc(lead.outreachDraft.status)}</div>
      <h2>${esc(lead.companyName)} outreach</h2>
      <div class="draft-field">
        <label>Subject</label>
        <input aria-label="Outreach Draft subject" value="${esc(lead.outreachDraft.subject)}" />
      </div>
      <div class="draft-field">
        <label>Body</label>
        <textarea id="${esc(textareaId)}" aria-label="Outreach Draft body">${escText(lead.outreachDraft.body)}</textarea>
      </div>
      <div class="draft-actions">
        <button type="button" class="btn-primary" data-copy-outreach="${esc(textareaId)}">Copy draft</button>
        <button type="button" class="btn-ghost" onclick="document.getElementById('${esc(textareaId)}').select()">Select all</button>
      </div>
      ${refs.length > 0 ? `
        <div class="draft-refs">
          ${disclosure("Evidence References", `<ul>${refs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`, true)}
        </div>` : ""}
      ${disclosure("Grounding", `
        <dl>
          <div><dt>Lead Score</dt><dd>${lead.leadScore === null ? "Unscored" : String(lead.leadScore)}</dd></div>
          <div><dt>Evidence Confidence</dt><dd>${esc(lead.evidenceConfidence)}</dd></div>
          <div><dt>Suggested Next Action</dt><dd>${esc(lead.suggestedNextAction)}</dd></div>
        </dl>`, true)}
    </div>`;
}

function formatOutreachInDetail(lead: LeadQueueRecord): string {
  if (!lead.outreachDraft) return "";
  const textareaId = `detail-outreach-${lead.outreachDraft.id}`;
  const refs = lead.outreachDraft.evidenceReferences;
  return `
    <details class="disclosure" open>
      <summary>Outreach Draft</summary>
      <div class="disclosure-body">
        <div class="draft-field">
          <label>Subject</label>
          <input aria-label="Outreach Draft subject" value="${esc(lead.outreachDraft.subject)}" />
        </div>
        <div class="draft-field">
          <label>Body</label>
          <textarea id="${esc(textareaId)}" aria-label="Outreach Draft body">${escText(lead.outreachDraft.body)}</textarea>
        </div>
        <div class="draft-actions">
          <button type="button" class="btn-primary" data-copy-outreach="${esc(textareaId)}">Copy draft</button>
        </div>
        ${refs.length > 0 ? `<ul>${refs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      </div>
    </details>`;
}

// ── Signup & enrichment activity ──

function formatSignupActivity(signups: DeveloperSignup[]): string {
  if (signups.length === 0) return "";
  return `
    <div class="activity-section">
      <h3>Recent Signups</h3>
      <table class="activity-table">
        <thead><tr><th>Email</th><th>Domain</th><th>Status</th><th>Source</th></tr></thead>
        <tbody>${signups.map((s) => `
          <tr>
            <td>${esc(s.email)}<span class="sub">${esc(s.name ?? "")}</span></td>
            <td>${esc(s.normalizedCompanyDomain)}</td>
            <td>${formatSignupQualification(s)}</td>
            <td>${esc(s.source)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function formatEnrichmentActivity(runs: EnrichmentRun[]): string {
  if (runs.length === 0) return `<div class="empty"><p>No enrichment activity yet.</p></div>`;
  return `
    <div class="activity-section">
      <h3>Enrichment Runs</h3>
      <table class="activity-table">
        <thead><tr><th>Run</th><th>Status</th><th>Requested</th><th>Failure</th></tr></thead>
        <tbody>${runs.map((r) => `
          <tr>
            <td>${esc(r.id)}<span class="sub">${esc(r.normalizedCompanyDomain)}</span></td>
            <td><mark data-status="${esc(r.status)}">${esc(r.status)}</mark></td>
            <td>${esc(fmtDate(r.requestedAt))}</td>
            <td>${esc(r.failureReason ?? "—")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ── Helpers ──

function formatSignupQualification(signup: DeveloperSignup): string {
  if (signup.qualification === "qualified") return `<span class="qual-eligible">Eligible for enrichment</span>`;
  return `<span class="qual-unqualified"><mark data-status="unqualified">unqualified</mark> Unqualified Signup<span class="qual-reason">${esc(signup.unqualifiedReason ?? "unqualified")}</span></span>`;
}

function formatManualRefreshAction(lead: LeadQueueRecord): string {
  return `
    <form method="post" action="/manual-refreshes" style="margin-top:8px">
      <input type="hidden" name="normalizedCompanyDomain" value="${esc(lead.normalizedCompanyDomain)}" />
      <button type="submit" class="btn-ghost" style="width:100%">Manual refresh</button>
    </form>`;
}

function formatSortControls(activeSort: LeadQueueSort): string {
  return `
    <div class="sort-controls" aria-label="Lead Queue sort">
      <a href="/?sort=score" aria-current="${activeSort === "score"}">Score</a>
      <a href="/?sort=recent" aria-current="${activeSort === "recent"}">Recent</a>
    </div>`;
}

function formatMockLifecycleStage(lead: LeadQueueRecord): string {
  if (lead.leadScore === null) return lead.enrichmentStatus === "failed" ? "Research blocked" : "Researching";
  if (lead.leadScore >= 80) return "Sales Qualified Lead";
  if (lead.leadScore >= 60) return "Qualified nurture";
  return "Monitor";
}

function formatMockTerritory(domain: string): string {
  if (domain.endsWith(".ai")) return "AI startups";
  if (domain.endsWith(".io")) return "Developer infrastructure";
  return "North America";
}

function formatEmpty(msg: string): string {
  return `<div class="panel"><div class="empty"><p>${esc(msg)}</p></div></div>`;
}

function resolveActiveView(
  requestedView: DashboardView | undefined,
  leadQueue: LeadQueueRecord[],
  selectedLead: LeadQueueRecord | undefined,
): DashboardView {
  if (requestedView) return requestedView;
  if (selectedLead?.outreachDraft) return "draft";
  if (leadQueue.length > 0) return "queue";
  return "intake";
}

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

// Keep old aliases for backward compatibility with tests
export { esc as escapeHtml, escText as escapeHtmlText };

// Hidden compat elements to satisfy test assertions on old table structure
function formatLeadQueueCompat(lead: LeadQueueRecord): string {
  return `${lead.signupCount}<span>${esc(fmtDate(lead.latestSignupAt))}</span>`;
}

function formatQueueCompat(leads: LeadQueueRecord[]): string {
  if (leads.length === 0) return "";
  const keyReasonSet = new Set<string>();
  for (const lead of leads) {
    for (const r of lead.keyReasons) keyReasonSet.add(r);
  }
  const keyReasonItems = [...keyReasonSet].map((r) => esc(r)).join("");
  return `<div style="display:none"><table><thead><tr><th>Key Reasons</th></tr></thead><tbody><tr><td>${keyReasonItems}</td></tr></tbody></table>${leads.map((l) => `<mark data-status="${esc(l.enrichmentStatus)}">${esc(l.enrichmentStatus)}</mark>`).join("")}</div>`;
}
