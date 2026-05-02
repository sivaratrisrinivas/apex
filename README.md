# Apex

Apex turns developer signups into a focused sales queue.

## What It Is

Apex is an internal prototype for spotting promising company leads from developer signup emails.

For example, when someone signs up with `engineer@modal.com`, Apex treats the company domain as the starting point, shows it in a sales dashboard, and prepares the app for later enrichment with company research, evidence, and lead scoring.

The current build includes the WSL-native Bun app foundation, a first Apex Dashboard shell, and demo signup intake. Later issues add storage, enrichment, scoring, and outreach drafts.

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

## Current Status

This repo currently has:

- a Bun server that serves the Apex Dashboard at `/`
- a demo endpoint at `POST /demo-signups` for Demo Signup Payload intake
- domain classification for qualified Developer Signups and visible Unqualified Signups
- a styled dashboard shell with a lead queue and selected lead detail panel
- automated tests for the dashboard route, demo signup validation, and domain classification
- WSL-focused setup notes

The next implementation issue is persistence: keeping Companies, Developer Signups, and Lead Queue records in a Prototype Store between restarts.
