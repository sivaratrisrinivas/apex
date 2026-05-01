const queueRows = [
  {
    company: "Modal",
    score: 95,
    status: "completed",
    confidence: "High",
    signups: 3,
    action: "Route to enterprise AE",
  },
  {
    company: "Perplexity",
    score: 91,
    status: "researching",
    confidence: "Building",
    signups: 2,
    action: "Watch funding signal",
  },
  {
    company: "Runpod",
    score: 88,
    status: "partial",
    confidence: "Medium",
    signups: 1,
    action: "Verify GPU workload",
  },
  {
    company: "Anysphere",
    score: 84,
    status: "completed",
    confidence: "High",
    signups: 4,
    action: "Draft technical outreach",
  },
];

export function renderDashboard(): string {
  const rows = queueRows
    .map(
      (row) => `
        <tr>
          <td>
            <strong>${row.company}</strong>
            <span>api.${row.company.toLowerCase()}.com</span>
          </td>
          <td><b>${row.score}</b></td>
          <td><mark data-status="${row.status}">${row.status}</mark></td>
          <td>${row.confidence}</td>
          <td>${row.signups}</td>
          <td>${row.action}</td>
        </tr>
      `,
    )
    .join("");

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

      table {
        width: 100%;
        border-collapse: collapse;
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

      .detail dl {
        display: grid;
        gap: 10px;
        margin: 18px 0;
      }

      .detail div {
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
          <section class="panel" aria-label="Lead Queue">
            <table>
              <caption>Lead Queue</caption>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Signups</th>
                  <th>Suggested Next Action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </section>
          <section class="panel detail" aria-label="Selected Lead detail">
            <h2>Modal evidence</h2>
            <div class="score">95</div>
            <dl>
              <div><dt>Purchasing Capacity</dt><dd>High</dd></div>
              <div><dt>Compute Intensity</dt><dd>GPU-heavy</dd></div>
              <div><dt>Parallel Fit</dt><dd>Strong</dd></div>
              <div><dt>Sales Timing</dt><dd>Immediate</dd></div>
            </dl>
            <p class="evidence">
              Evidence Basis preview: recent infrastructure hiring, AI workload language,
              and multiple Developer Signups from the same Company.
            </p>
          </section>
        </div>
      </main>
    </div>
  </body>
</html>`;
}
