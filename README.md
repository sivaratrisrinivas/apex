# Apex

## What

Apex is a local sales prototype for Parallel.

It turns a developer signup email into a company lead. When someone signs up with an email like `engineer@modal.com`, Apex finds the company domain, researches the company, scores the lead, shows the reasons behind the score, and helps draft a sales email.

The dashboard is built for a simple sales flow:

- see which companies signed up
- spot the best leads first
- review the evidence behind each lead
- refresh company research when needed
- write or rewrite a sales email for Parallel

It can run on your machine with local demo data, or on Render as a free web service for demos.

## Why

Good company opportunities can hide inside normal developer signups. A single engineer using a free or trial account may work at a company that is growing fast, spending on compute, or building products that fit Parallel well.

Researching each signup by hand is slow. Apex gives the sales team a faster first pass:

- it groups signups by company
- it avoids doing the same research twice while a company is already being researched
- it keeps older research until it is stale
- it explains why a lead is worth attention
- it drafts outreach that sounds like a sales story, not a data dump

The goal is not to replace a salesperson. The goal is to help them quickly decide who is worth reaching out to and what story to tell.

## How

Run everything from this repo inside WSL:

```bash
cd /home/srinivas/workspace/github.com/sivaratrisrinivas/apex
bun install
bun test
bun run dev
```

Open the dashboard:

```text
http://localhost:3000
```

If port `3000` is busy, use another port:

```bash
PORT=3010 bun run dev
```

For a local demo with no live API key:

```bash
APEX_ENRICHMENT_MODE=fake bun run dev
```

You can also run the scripted demo:

```bash
bun run demo:wsl
```

Submit a demo signup:

```bash
curl -s http://localhost:3000/demo-signups \
  -H 'content-type: application/json' \
  -d '{"email":"engineer@modal.com","name":"Ada Lovelace"}'
```

Generate a sales draft for a company that already has research:

```bash
curl -s http://localhost:3000/outreach-drafts \
  -H 'content-type: application/json' \
  -d '{"normalizedCompanyDomain":"modal.com"}'
```

Ask Apex to rewrite that draft:

```bash
curl -s http://localhost:3000/outreach-drafts \
  -H 'content-type: application/json' \
  -d '{"normalizedCompanyDomain":"modal.com","regenerate":true}'
```

Use live Parallel research on your machine by adding a Parallel API key to `.env.local`:

```bash
PARALLEL_API_KEY=...
```

Then start the app normally:

```bash
bun run dev
```

Local data is stored in `.apex/prototype.sqlite`. The `.apex/` folder is ignored by git, so demo data and local experiments stay on your machine.

To deploy the demo on Render:

1. Create a Render Web Service from this repo.
2. Choose the free instance type.
3. Set the build command to `bun install`.
4. Set the start command to `bun start`.
5. Add `PARALLEL_API_KEY` for live company research.
6. Add `GEMINI_API_KEY` if you want Gemini-written sales drafts.
7. Deploy.

On Render Free, Apex uses local SQLite demo storage. That storage is temporary: it can reset when the service restarts, spins down, or redeploys. That is enough for this prototype, but it is not meant for production data.
