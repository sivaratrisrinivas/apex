# Apex

Apex turns developer signups into a focused sales queue.

## What It Is

Apex is an internal prototype for spotting promising company leads from developer signup emails.

For example, when someone signs up with `engineer@modal.com`, Apex treats the company domain as the starting point, shows it in a sales dashboard, and prepares the app for later enrichment with company research, evidence, and lead scoring.

The current build includes the WSL-native Bun app foundation, the Apex Dashboard shell, demo signup intake, a SQLite-backed Prototype Store, and the asynchronous Enrichment Run lifecycle. Later issues plug in real or fixture-backed enrichment, scoring, and outreach drafts.

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

## Prototype Store

The running app keeps local demo data in a SQLite-backed Prototype Store at `.apex/prototype.sqlite`. The `.apex/` directory is ignored by git so prepared demo data and local experiments do not get committed.

Use `APEX_PROTOTYPE_STORE_PATH` to point a demo at a different store file:

```bash
APEX_PROTOTYPE_STORE_PATH=/tmp/apex-demo.sqlite bun run dev
```

Qualified Developer Signups create or reuse one Company per Normalized Company Domain and create an Enrichment Run with an explicit Enrichment Status. Repeated signups from the same Company are preserved individually while updating the single active Lead Queue record with signup count, latest-signup urgency signals, and the latest run status.

Until the fake or live Parallel enrichment issues are implemented, the local server records runs as `researching`. The app-level enrichment worker interface already supports `completed`, `partial`, and `failed` outcomes, and the dashboard renders those states when a worker returns them.

## Current Status

This repo currently has:

- a Bun server that serves the Apex Dashboard at `/`
- a demo endpoint at `POST /demo-signups` for Demo Signup Payload intake
- domain classification for qualified Developer Signups and visible Unqualified Signups
- a SQLite-backed Prototype Store that persists Developer Signups, Companies, Enrichment Runs, and initial Lead Queue records
- Company deduplication by Normalized Company Domain, while preserving every Developer Signup
- one active Lead Queue record per Company with signup count and latest-signup urgency signals
- asynchronous Enrichment Run creation and status transitions for `pending`, `researching`, `completed`, `partial`, and `failed`
- visible `unqualified` status for Unqualified Signups without starting research
- a styled dashboard shell with a lead queue, selected lead detail panel, and visible signup intake history
- automated tests for the dashboard route, demo signup validation, domain classification, persistence, deduplication, Lead Queue urgency signals, and Enrichment Run lifecycle behavior
- WSL-focused setup notes

The next enrichment issues add fake local fixtures and the live Core2x Parallel client behind the existing lifecycle.
