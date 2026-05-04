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
}

export function renderDashboard(options: DashboardOptions = {}): string {
  const leadQueue = options.leadQueue ?? [];
  const leadQueueSort = options.leadQueueSort ?? "score";
  const selectedLead =
    leadQueue.find(
      (lead) =>
        lead.normalizedCompanyDomain ===
        options.selectedLeadDomain?.trim().toLowerCase(),
    ) ?? leadQueue[0];
  const rows = leadQueue
    .map(
      (row) => `
        <tr>
          <td>
            <a class="lead-link" href="/?lead=${encodeURIComponent(row.normalizedCompanyDomain)}&sort=${leadQueueSort}">
              <strong>${escapeHtml(row.companyName)}</strong>
            </a>
            <span>${escapeHtml(row.normalizedCompanyDomain)}</span>
          </td>
          <td><b>${formatLeadScore(row)}</b></td>
          <td><mark data-status="${escapeHtml(row.enrichmentStatus)}">${escapeHtml(row.enrichmentStatus)}</mark></td>
          <td>${formatInlineList(row.keyReasons)}</td>
          <td>${escapeHtml(row.evidenceConfidence)}</td>
          <td>${row.signupCount}<span>${escapeHtml(formatLatestSignup(row.latestSignupAt))}</span></td>
          <td>${escapeHtml(row.suggestedNextAction)}</td>
        </tr>
      `,
    )
    .join("");
  const leadQueueBody =
    rows ||
    `
      <tr>
        <td colspan="7">No Leads yet.</td>
      </tr>
    `;
  const developerSignupRows = (options.developerSignups ?? [])
    .map(
      (signup) => `
        <tr>
          <td>
            <strong>${escapeHtml(signup.email)}</strong>
            <span>${escapeHtml(signup.name ?? "Unnamed Developer Signup")}</span>
          </td>
          <td>${escapeHtml(signup.normalizedCompanyDomain)}</td>
          <td>${formatSignupQualification(signup)}</td>
          <td>${escapeHtml(signup.source)}</td>
        </tr>
      `,
    )
    .join("");
  const developerSignupBody =
    developerSignupRows ||
    `
      <tr>
        <td colspan="4">No Demo Signup Payloads yet.</td>
      </tr>
    `;
  const enrichmentRunRows = (options.enrichmentRuns ?? [])
    .map(
      (enrichmentRun) => `
        <tr>
          <td>
            <strong>${escapeHtml(enrichmentRun.id)}</strong>
            <span>${escapeHtml(enrichmentRun.normalizedCompanyDomain)}</span>
          </td>
          <td><mark data-status="${escapeHtml(enrichmentRun.status)}">${escapeHtml(enrichmentRun.status)}</mark></td>
          <td>${escapeHtml(formatLatestSignup(enrichmentRun.requestedAt))}</td>
          <td>${escapeHtml(enrichmentRun.failureReason ?? "None")}</td>
        </tr>
      `,
    )
    .join("");
  const enrichmentRunBody =
    enrichmentRunRows ||
    `
      <tr>
        <td colspan="4">No Enrichment Runs yet.</td>
      </tr>
    `;
  const selectedLeadDetail = selectedLead
    ? `
            <h2>${escapeHtml(selectedLead.companyName)} details</h2>
            ${formatLeadScoreBadge(selectedLead)}
            <dl>
              <div><dt>Normalized Company Domain</dt><dd>${escapeHtml(selectedLead.normalizedCompanyDomain)}</dd></div>
              <div><dt>Enrichment Status</dt><dd>${escapeHtml(selectedLead.enrichmentStatus)}</dd></div>
              <div><dt>Developer Signups</dt><dd>${selectedLead.signupCount}</dd></div>
              <div><dt>Latest Signup</dt><dd>${escapeHtml(formatLatestSignup(selectedLead.latestSignupAt))}</dd></div>
            </dl>
            ${formatMockCrmFields(selectedLead)}
            ${formatManualRefreshAction(selectedLead)}
            ${formatScoreBreakdown(selectedLead)}
            ${formatScoreReasons(selectedLead.scoreReasons)}
            ${formatKeyReasons(selectedLead.keyReasons)}
            ${formatEvidenceBasis(selectedLead.evidenceBasis)}
            ${formatRawCompanyEnrichment(selectedLead)}
      `
    : `
            <h2>No Lead selected</h2>
            <div class="score score-empty">--</div>
            <p class="evidence">
              Submit a qualified Demo Signup Payload to create the first Lead Queue record.
            </p>
      `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Apex Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f8fb;
        --ink: #121821;
        --muted: #637083;
        --line: #dce3ed;
        --panel: #ffffff;
        --panel-soft: #f9fbfe;
        --cyan: #0ea5c8;
        --green: #20a66a;
        --amber: #b7791f;
        --shadow: 0 18px 50px rgba(31, 45, 61, 0.1);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(180deg, rgba(14, 165, 200, 0.08), transparent 340px),
          var(--bg);
        color: var(--ink);
      }

      button,
      input {
        font: inherit;
      }

      .shell {
        display: grid;
        grid-template-columns: 232px minmax(0, 1fr);
        min-height: 100vh;
      }

      aside {
        border-right: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
        padding: 24px 18px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 22px;
        font-weight: 760;
        letter-spacing: 0;
      }

      .brand::before {
        content: "";
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background:
          linear-gradient(135deg, var(--cyan), var(--green));
        box-shadow: 0 10px 30px rgba(14, 165, 200, 0.3);
      }

      nav {
        display: grid;
        gap: 6px;
        margin-top: 30px;
      }

      nav a {
        color: var(--muted);
        padding: 10px 12px;
        text-decoration: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 640;
      }

      nav a:first-child {
        background: #eaf7fb;
        color: #075f73;
      }

      main {
        padding: 22px;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 18px;
      }

      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.15;
        letter-spacing: 0;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #0d6b46;
        background: #e7f8ef;
        border: 1px solid #b8ebcf;
        border-radius: 999px;
        padding: 7px 11px;
        font-size: 13px;
        font-weight: 680;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 18px;
      }

      .queue-column {
        display: grid;
        gap: 18px;
        min-width: 0;
      }

      .panel {
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--shadow);
      }

      .intake {
        display: grid;
        grid-template-columns: minmax(230px, 1fr) auto;
        gap: 10px;
        padding: 14px;
        margin-bottom: 14px;
      }

      input {
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 11px 12px;
        color: var(--ink);
      }

      button {
        border: 0;
        border-radius: 8px;
        padding: 11px 14px;
        background: #111827;
        color: white;
        font-weight: 720;
      }

      .refresh-action {
        margin: 14px 0 18px;
      }

      .refresh-action button {
        width: 100%;
        background: #075f73;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      .table-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px 0;
      }

      .table-toolbar h2 {
        margin: 0;
        font-size: 18px;
        letter-spacing: 0;
      }

      .sort-controls {
        display: inline-flex;
        gap: 6px;
      }

      .sort-controls a {
        color: var(--muted);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 7px 9px;
        text-decoration: none;
        font-size: 12px;
        font-weight: 720;
      }

      .sort-controls a[aria-current="true"] {
        color: #075f73;
        background: #eaf7fb;
        border-color: #bce8f2;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      caption {
        padding: 16px 18px 4px;
        text-align: left;
        font-size: 18px;
        font-weight: 760;
      }

      th,
      td {
        padding: 14px 18px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        font-size: 14px;
      }

      th {
        color: var(--muted);
        font-size: 12px;
        font-weight: 760;
        text-transform: uppercase;
      }

      td span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-top: 3px;
      }

      .lead-link {
        color: inherit;
        text-decoration: none;
      }

      .lead-link:hover {
        color: #075f73;
        text-decoration: underline;
      }

      mark {
        display: inline-flex;
        border-radius: 999px;
        padding: 4px 8px;
        background: #eef5ff;
        color: #195b9d;
        font-size: 12px;
        font-weight: 700;
      }

      mark[data-status="completed"] {
        background: #e7f8ef;
        color: #0d6b46;
      }

      mark[data-status="partial"] {
        background: #fff5df;
        color: var(--amber);
      }

      mark[data-status="pending"] {
        background: #eef5ff;
        color: #195b9d;
      }

      mark[data-status="researching"] {
        background: #eaf7fb;
        color: #075f73;
      }

      mark[data-status="failed"] {
        background: #ffe8e8;
        color: #a02727;
      }

      mark[data-status="unqualified"] {
        background: #f2f4f7;
        color: #526070;
      }

      .detail {
        padding: 18px;
      }

      .detail h2 {
        margin: 0 0 12px;
        font-size: 18px;
        letter-spacing: 0;
      }

      .score {
        display: grid;
        place-items: center;
        width: 112px;
        height: 112px;
        border-radius: 50%;
        color: #075f73;
        background:
          radial-gradient(circle at center, white 54%, transparent 56%),
          conic-gradient(var(--cyan) 0 95%, #e6eef6 95%);
        font-size: 30px;
        font-weight: 800;
      }

      .score-empty {
        background: #eef5ff;
        color: #637083;
        font-size: 24px;
      }

      .detail dl {
        display: grid;
        gap: 10px;
        margin: 18px 0;
      }

      .detail dl > div {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        color: var(--muted);
        font-size: 13px;
      }

      .detail dd {
        margin: 0;
        color: var(--ink);
        font-weight: 700;
      }

      .evidence {
        padding: 14px;
        border-radius: 8px;
        background: var(--panel-soft);
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .evidence ul {
        margin: 8px 0 0;
        padding-left: 18px;
      }

      .evidence pre {
        overflow: auto;
        margin: 10px 0 0;
        padding: 10px;
        border-radius: 8px;
        background: #111827;
        color: #f9fbfe;
        font-size: 12px;
        line-height: 1.45;
      }

      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
        }

        aside {
          display: none;
        }

        .grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        main {
          padding: 14px;
        }

        header,
        .intake {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        header {
          display: grid;
        }

        th:nth-child(4),
        td:nth-child(4),
        th:nth-child(5),
        td:nth-child(5) {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">Apex</div>
        <nav aria-label="Primary">
          <a href="/">Lead Queue</a>
          <a href="/">Enrichment Runs</a>
          <a href="/">Evidence</a>
          <a href="/">Settings</a>
        </nav>
      </aside>
      <main>
        <header>
          <div>
            <h1>Apex Dashboard</h1>
            <p>Near-Real-Time Enrichment for enterprise-ready Developer Signups.</p>
          </div>
          <span class="status">WSL local</span>
        </header>
        <section class="panel intake" aria-label="Demo Signup Payload">
          <input aria-label="Developer email" value="engineer@modal.com" />
          <button type="button">Submit Signup</button>
        </section>
        <div class="grid">
          <div class="queue-column">
            <section class="panel" aria-label="Lead Queue">
              <div class="table-toolbar">
                <h2>Lead Queue</h2>
                ${formatLeadQueueSortControls(leadQueueSort)}
              </div>
              <table>
                <caption class="sr-only">Lead Queue</caption>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Key Reasons</th>
                    <th>Confidence</th>
                    <th>Signups</th>
                    <th>Suggested Next Action</th>
                  </tr>
                </thead>
                <tbody>${leadQueueBody}</tbody>
              </table>
            </section>
            <section class="panel" aria-label="Developer Signups">
              <table>
                <caption>Developer Signups</caption>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Normalized Company Domain</th>
                    <th>Qualification</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>${developerSignupBody}</tbody>
              </table>
            </section>
            <section class="panel" aria-label="Enrichment Runs">
              <table>
                <caption>Enrichment Runs</caption>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Failure Reason</th>
                  </tr>
                </thead>
                <tbody>${enrichmentRunBody}</tbody>
              </table>
            </section>
          </div>
          <section class="panel detail" aria-label="Selected Lead detail">
${selectedLeadDetail}
          </section>
        </div>
      </main>
    </div>
  </body>
</html>`;
}

function formatSignupQualification(signup: DeveloperSignup): string {
  if (signup.qualification === "qualified") {
    return "Eligible for enrichment";
  }

  return `Unqualified Signup: <mark data-status="unqualified">unqualified</mark><span>${escapeHtml(signup.unqualifiedReason ?? "unqualified")}</span>`;
}

function formatLeadQueueSortControls(activeSort: LeadQueueSort): string {
  return `
                <div class="sort-controls" aria-label="Lead Queue sort">
                  <a href="/?sort=score" aria-current="${activeSort === "score"}">Lead Score</a>
                  <a href="/?sort=recent" aria-current="${activeSort === "recent"}">Recent Signup</a>
                </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatLeadScore(lead: LeadQueueRecord): string {
  return lead.leadScore === null ? "Unscored" : String(lead.leadScore);
}

function formatLeadScoreBadge(lead: LeadQueueRecord): string {
  if (lead.leadScore === null) {
    return `<div class="score score-empty">--</div>`;
  }

  return `<div class="score">${lead.leadScore}</div>`;
}

function formatInlineList(items: string[]): string {
  if (items.length === 0) {
    return "None yet";
  }

  return items
    .map((item) => `<span class="reason">${escapeHtml(item)}</span>`)
    .join("");
}

function formatManualRefreshAction(lead: LeadQueueRecord): string {
  return `
            <form class="refresh-action" method="post" action="/manual-refreshes">
              <input type="hidden" name="normalizedCompanyDomain" value="${escapeHtml(lead.normalizedCompanyDomain)}" />
              <button type="submit">Manual refresh</button>
            </form>
  `;
}

function formatMockCrmFields(lead: LeadQueueRecord): string {
  const fields = [
    ["Lifecycle Stage", formatMockLifecycleStage(lead)],
    ["Owner", formatMockOwner(lead)],
    ["Territory", formatMockTerritory(lead.normalizedCompanyDomain)],
    [
      "Last Activity",
      `${lead.signupCount} Developer Signup${
        lead.signupCount === 1 ? "" : "s"
      } - ${formatLatestSignup(lead.latestSignupAt)}`,
    ],
  ] as const;

  return `
            <div class="evidence">
              <strong>Mock CRM Fields</strong>
              <dl>
                ${fields
                  .map(
                    ([label, value]) => `
                <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
                    `,
                  )
                  .join("")}
              </dl>
            </div>
  `;
}

function formatMockLifecycleStage(lead: LeadQueueRecord): string {
  if (lead.leadScore === null) {
    return lead.enrichmentStatus === "failed" ? "Research blocked" : "Researching";
  }

  if (lead.leadScore >= 80) {
    return "Sales Qualified Lead";
  }

  if (lead.leadScore >= 60) {
    return "Qualified nurture";
  }

  return "Monitor";
}

function formatMockOwner(lead: LeadQueueRecord): string {
  return lead.leadScore !== null && lead.leadScore >= 80
    ? "Enterprise AE"
    : "GTM Research";
}

function formatMockTerritory(normalizedCompanyDomain: string): string {
  if (normalizedCompanyDomain.endsWith(".ai")) {
    return "AI startups";
  }

  if (normalizedCompanyDomain.endsWith(".io")) {
    return "Developer infrastructure";
  }

  return "North America";
}

function formatScoreBreakdown(lead: LeadQueueRecord): string {
  if (!lead.scoreBreakdown) {
    return "";
  }

  const dimensions = [
    ["Purchasing Capacity", lead.scoreBreakdown.purchasingCapacity],
    ["Compute Intensity", lead.scoreBreakdown.computeIntensity],
    ["Parallel Fit", lead.scoreBreakdown.parallelFit],
    ["Sales Timing", lead.scoreBreakdown.salesTiming],
    ["Evidence Confidence", lead.scoreBreakdown.evidenceConfidence],
  ] as const;

  return `
            <div class="evidence">
              <strong>Lead Score Breakdown</strong>
              <ul>
                ${dimensions
                  .map(
                    ([label, dimension]) => `
                <li>
                  <b>${escapeHtml(label)}</b>
                  <span>${dimension.score}/${dimension.maxScore}</span>
                  <span>${escapeHtml(dimension.reason)}</span>
                </li>
                  `,
                  )
                  .join("")}
              </ul>
            </div>
  `;
}

function formatScoreReasons(scoreReasons: string[]): string {
  if (scoreReasons.length === 0) {
    return "";
  }

  return `
            <div class="evidence">
              <strong>Top score reasons</strong>
              <ul>
                ${scoreReasons
                  .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                  .join("")}
              </ul>
            </div>
  `;
}

function formatKeyReasons(keyReasons: string[]): string {
  if (keyReasons.length === 0) {
    return "";
  }

  return `
            <div class="evidence">
              <strong>Key reasons</strong>
              <ul>
                ${keyReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
              </ul>
            </div>
  `;
}

function formatEvidenceBasis(evidenceBasis: EvidenceBasisItem[]): string {
  if (evidenceBasis.length === 0) {
    return `
            <p class="evidence">
              Evidence Basis will appear after enrichment completes.
            </p>
    `;
  }

  return `
            <div class="evidence">
              <strong>Evidence Basis</strong>
              <ul>
                ${evidenceBasis.map(formatEvidenceBasisItem).join("")}
              </ul>
            </div>
  `;
}

function formatEvidenceBasisItem(item: EvidenceBasisItem): string {
  const excerpts = item.citations.flatMap((citation) => citation.excerpts);
  const firstExcerpt = excerpts[0];

  return `
                <li>
                  <b>${escapeHtml(item.field)}</b>
                  <span>${escapeHtml(item.confidence)}</span>
                  ${firstExcerpt ? `<span>${escapeHtml(firstExcerpt)}</span>` : ""}
                </li>
  `;
}

function formatRawCompanyEnrichment(lead: LeadQueueRecord): string {
  if (!lead.companyEnrichment) {
    return `
            <p class="evidence">
              Raw Company Enrichment will appear after enrichment completes.
            </p>
    `;
  }

  return `
            <div class="evidence">
              <strong>Raw Company Enrichment</strong>
              <pre>${escapeHtmlText(JSON.stringify(lead.companyEnrichment.content, null, 2))}</pre>
            </div>
  `;
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatLatestSignup(signedUpAt: string): string {
  return new Date(signedUpAt).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}
