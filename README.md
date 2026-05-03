# Apex

Apex turns developer signups into a focused sales queue.

## What It Is

Apex is an internal prototype for spotting promising company leads from developer signup emails.

For example, when someone signs up with `engineer@modal.com`, Apex treats the company domain as the starting point, runs fixture-backed or live enrichment, scores the resulting Lead, and shows the evidence behind that score in the sales dashboard.

The current build includes the WSL-native Bun app foundation, the Apex Dashboard shell, demo signup intake, a SQLite-backed Prototype Store, the asynchronous Enrichment Run lifecycle, live Core2x wiring, fixture-backed fake enrichment for local demos, evidence-aware Lead Score calculation, and seven-day Freshness Window controls with manual refresh. Later issues plug in richer dashboard interactions and outreach drafts.

## Why It Exists

Sales teams can miss valuable companies when thousands of developers sign up on free or low-cost tiers. Manually researching every signup is slow and expensive.

Apex is meant to make that first pass easier:

- show new company leads in one place
- make high-priority leads easy to spot
- keep the evidence behind each lead visible
- run locally in WSL while the prototype is being built

## How To Run It

All commands should run inside WSL from this repo:

```bash
cd /home/srinivas/workspace/github.com/sivaratrisrinivas/apex
```

Use the Bun installation already configured in WSL:

```bash
bun --version
```

If a non-interactive shell has not picked up the WSL Bun path yet, load your shell profile:

```bash
source ~/.bashrc
```

You can also call Bun directly from its WSL install path:

```bash
/home/srinivas/.bun/bin/bun --version
```

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Start the dashboard:

```bash
bun run dev
```

Then open [http://localhost:3000](http://localhost:3000).

If port 3000 is already in use, choose another WSL-local port:

```bash
PORT=3010 bun run dev
```

Submit a Demo Signup Payload:

```bash
curl -s http://localhost:3000/demo-signups \
  -H 'content-type: application/json' \
  -d '{"email":"engineer@modal.com","name":"Ada Lovelace"}'
```

The response includes the stored Developer Signup and, for qualified company domains, the pending Enrichment Run that was created for that Company. The dashboard then advances the run to `researching` asynchronously so signup intake stays responsive while research is still in progress.

Use fixture-backed fake enrichment for a complete WSL-local demo without live Parallel credentials:

```bash
APEX_ENRICHMENT_MODE=fake bun run dev
```

The fake path exercises the same Enrichment Run lifecycle as the live worker. `engineer@modal.com` produces a completed, evidence-backed Company Enrichment, while `founder@runpod.io` produces a lower-confidence Partial Enrichment.

## Freshness Window and Manual Refresh

Apex reuses a fresh **Company Enrichment** for later **Developer Signups** from the same **Company** when the latest enrichment is no more than seven days old. Reuse avoids unnecessary Parallel spend while still preserving the new Developer Signup and updating the single active Lead Queue record with signup count, latest signup, Sales Timing, and Lead Score.

When the latest Company Enrichment is older than the seven-day **Freshness Window**, a later qualified signup starts a new **Enrichment Run**. The Lead remains visible in the queue and shows the latest run status while new research is in progress.

The selected Lead detail panel includes a **Manual refresh** action for demo control. It forces a new Enrichment Run for the selected Normalized Company Domain even when the existing enrichment is still fresh.

You can also trigger the same refresh endpoint from WSL:

```bash
curl -i http://localhost:3000/manual-refreshes \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'normalizedCompanyDomain=modal.com'
```

Form submissions redirect back to `/`; JSON-style callers receive the created Enrichment Run payload.

## Lead Scoring

Completed and partial Company Enrichments produce a Lead Score from the agreed Apex dimensions:

- Purchasing Capacity
- Compute Intensity
- Parallel Fit
- Sales Timing
- Evidence Confidence

The Prototype Store persists the numeric Lead Score, the score breakdown, and the top score reasons on the Lead Queue record. The dashboard shows the score in the queue and exposes the breakdown in the selected Lead detail panel.

Partial Enrichments can still create scored Leads when the Company identity is usable. Missing or weaker evidence lowers Evidence Confidence instead of failing the Enrichment Run. Apex also caps otherwise high-scoring Leads below the high-score threshold when the Enrichment Run does not provide an Evidence Basis, so the dashboard does not display unsupported high-priority recommendations.

## Prototype Store

The running app keeps local demo data in a SQLite-backed Prototype Store at `.apex/prototype.sqlite`. The `.apex/` directory is ignored by git so prepared demo data and local experiments do not get committed.

Use `APEX_PROTOTYPE_STORE_PATH` to point a demo at a different store file:

```bash
APEX_PROTOTYPE_STORE_PATH=/tmp/apex-demo.sqlite bun run dev
```

## Live Core2x Enrichment

Apex starts live **Core2x Enrichment** when `PARALLEL_API_KEY` is available in the WSL environment:

```bash
export PARALLEL_API_KEY=...
bun run dev
```

Without `PARALLEL_API_KEY` or `APEX_ENRICHMENT_MODE=fake`, qualified **Enrichment Runs** stay visible as `researching` so the dashboard can still demonstrate **Near-Real-Time Enrichment** state without live credentials. `PARALLEL_API_BASE_URL` can point the client at a non-production Parallel-compatible endpoint for local verification.

Qualified Developer Signups create or reuse one Company per Normalized Company Domain and create an Enrichment Run with an explicit Enrichment Status. Repeated signups from the same Company are preserved individually while updating the single active Lead Queue record with signup count, latest-signup urgency signals, and the latest run status.

Fresh Company Enrichments are reused inside the seven-day Freshness Window. Stale enrichments and manual refresh requests create new Enrichment Runs for the same Company without duplicating the active Lead.

The local server records runs as `researching` until the configured enrichment worker finishes. The live Parallel path stores completed **Company Enrichments** and **Evidence Basis** from the Task API result; API errors produce a failed **Enrichment Status** with the visible failure reason. The app-level enrichment worker interface also supports fake workers for tests and local fixture-backed demos.

## Current Status

This repo currently has:

- a Bun server that serves the Apex Dashboard at `/`
- a demo endpoint at `POST /demo-signups` for Demo Signup Payload intake
- a manual refresh endpoint at `POST /manual-refreshes` for forcing a new Enrichment Run
- domain classification for qualified Developer Signups and visible Unqualified Signups
- a SQLite-backed Prototype Store that persists Developer Signups, Companies, Enrichment Runs, and initial Lead Queue records
- Company deduplication by Normalized Company Domain, while preserving every Developer Signup
- one active Lead Queue record per Company with signup count and latest-signup urgency signals
- seven-day Freshness Window reuse for fresh Company Enrichments, with stale signups starting new Enrichment Runs
- a dashboard Manual refresh action for selected Leads
- asynchronous Enrichment Run creation and status transitions for `pending`, `researching`, `completed`, `partial`, and `failed`
- live Core2x Parallel Task API wiring when `PARALLEL_API_KEY` is set
- fixture-backed fake enrichment with completed and partial Company Enrichment results when `APEX_ENRICHMENT_MODE=fake`
- persisted Company Enrichments and Evidence Basis for completed live or fake worker results
- Lead Score calculation from Purchasing Capacity, Compute Intensity, Parallel Fit, Sales Timing, and Evidence Confidence
- persisted score breakdowns and top score reasons on Lead Queue records
- a high-score evidence gate that prevents unsupported high Lead Scores from being displayed
- visible `unqualified` status for Unqualified Signups without starting research
- a styled dashboard shell with a lead queue, selected lead detail panel, and visible signup intake history
- automated tests for the dashboard route, demo signup validation, domain classification, persistence, deduplication, Lead Queue urgency signals, Enrichment Run lifecycle behavior, Freshness Window behavior, fake enrichment, and Lead Score behavior
- WSL-focused setup notes

The next enrichment issues add richer dashboard detail behavior and outreach draft generation behind the existing lifecycle.
