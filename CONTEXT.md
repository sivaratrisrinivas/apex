# Apex

Apex is an internal lead enrichment context for turning inbound developer signups into sales-ready company leads.

## Language

**Developer Signup**:
An inbound event created when a developer signs up for an API key using an email address.
_Avoid_: User, account, developer

**Demo Signup Payload**:
The minimal webhook input Apex accepts to simulate a **Developer Signup** during the prototype.
_Avoid_: Signup API, webhook schema, user payload

**Company**:
The organization inferred from a **Developer Signup** email domain and enriched with firmographic and technical signals.
_Avoid_: Account, employer, customer

**Normalized Company Domain**:
The canonical company domain Apex uses to identify one **Company** across multiple **Developer Signups**.
_Avoid_: Email domain, website, URL

**Lead**:
A sales-facing record produced by Apex after enriching a **Company**.
_Avoid_: Prospect, account, opportunity

**Lead Score**:
A numeric ranking of how worth immediate sales attention a **Lead** is for Parallel's enterprise API offering.
_Avoid_: Fit score, propensity score, priority

**Purchasing Capacity**:
A scoring dimension that estimates whether a **Company** can afford enterprise API spend.
_Avoid_: Budget, ability to pay

**Compute Intensity**:
A scoring dimension that estimates how heavily a **Company** depends on AI, GPU, infrastructure, or data-processing workloads.
_Avoid_: GPU need, infrastructure need

**Parallel Fit**:
A scoring dimension that estimates whether a **Company** would benefit from Parallel-style research, enrichment, or task automation.
_Avoid_: Product fit, ICP match

**Sales Timing**:
A scoring dimension that estimates whether recent company activity makes immediate outreach more promising.
_Avoid_: Urgency, buying window

**Evidence Confidence**:
A scoring dimension that estimates how reliable the evidence behind a **Company Enrichment** is.
_Avoid_: Certainty, data quality

**Company Enrichment**:
The structured Apex output that describes a **Company** using firmographic, technical, and sales signals.
_Avoid_: Research result, enrichment blob, company profile

**Enrichment Schema**:
The strict structured shape Apex asks Parallel to return for a **Company Enrichment**.
_Avoid_: JSON blob, response format, output contract

**Partial Enrichment**:
A usable **Company Enrichment** with missing or disputed non-critical fields.
_Avoid_: Failed enrichment, incomplete result, bad data

**Evidence Basis**:
The supporting citations, snippets, confidence, or reasoning behind important **Company Enrichment** fields.
_Avoid_: Debug data, sources, raw result

**Enrichment Run**:
An asynchronous Apex workflow that researches one **Company** and produces a **Company Enrichment**.
_Avoid_: Job, task, research request

**Core2x Enrichment**:
The normal prototype enrichment path that uses Parallel's Core2x processor for cost-conscious structured company research.
_Avoid_: Default processor, cheap enrichment, basic research

**Enrichment Status**:
The lifecycle state of an **Enrichment Run** as it moves from signup intake to sales visibility.
_Avoid_: Job status, task state, pipeline state

**Freshness Window**:
The time period during which an existing **Company Enrichment** can be reused instead of starting another **Enrichment Run**.
_Avoid_: Cache TTL, expiry, refresh interval

**Near-Real-Time Enrichment**:
An **Enrichment Run** experience where the signup is acknowledged immediately and the enrichment usually completes within minutes.
_Avoid_: Real-time enrichment, instant enrichment

**Firmographic Signals**:
Business facts about a **Company** that indicate enterprise purchasing capacity.
_Avoid_: Company data, business metadata

**Technical Signals**:
Evidence about a **Company**'s engineering workloads and infrastructure intensity.
_Avoid_: Tech stack data, engineering profile

**Sales Signals**:
Sales-facing conclusions derived from a **Company Enrichment**.
_Avoid_: Recommendations, CRM notes

**Suggested Next Action**:
The immediate sales action Apex recommends for a **Lead**.
_Avoid_: Recommendation, task, CTA

**Outreach Draft**:
An editable sales message generated from a **Lead** and its **Evidence Basis**.
_Avoid_: Email, sales copy, sequence

**Lead Queue**:
The Apex-owned list of **Leads** shown to sales users in the prototype dashboard.
_Avoid_: CRM, pipeline, data explorer

**Apex Dashboard**:
The single-page internal interface that lets sales users submit demo signups, scan the **Lead Queue**, and inspect lead evidence.
_Avoid_: Landing page, admin portal, CRM

**Prototype Store**:
The local persistence layer Apex uses to keep demo signups, enrichment runs, and leads between restarts.
_Avoid_: Database, production store, CRM

**Mock CRM Fields**:
Optional demo fields that imitate CRM context without making the CRM the prototype source of truth.
_Avoid_: CRM integration, Salesforce data, HubSpot data

**Unqualified Signup**:
A **Developer Signup** that Apex should not enrich because its email domain is not a usable company domain.
_Avoid_: Failed lead, bad signup, rejected user

## Relationships

- A **Developer Signup** identifies zero or one **Company**
- A **Demo Signup Payload** creates one **Developer Signup**
- A **Company** is identified by one **Normalized Company Domain**
- A **Company** can be associated with many **Developer Signups**
- A **Developer Signup** from a personal, educational, or disposable email domain becomes an **Unqualified Signup**
- A **Developer Signup** for a usable company domain starts an **Enrichment Run**
- An **Enrichment Run** belongs to exactly one **Company**
- An **Enrichment Run** has one **Enrichment Status**
- A normal prototype **Enrichment Run** uses **Core2x Enrichment**
- A fresh **Company Enrichment** within the **Freshness Window** can be reused for later **Developer Signups**
- An **Enrichment Run** provides **Near-Real-Time Enrichment**
- A **Company Enrichment** contains **Firmographic Signals**, **Technical Signals**, and **Sales Signals**
- A **Company Enrichment** conforms to the **Enrichment Schema**
- A **Partial Enrichment** can still produce a **Lead** when the **Company** identity is usable
- A **Company Enrichment** has an **Evidence Basis** for important fields and conclusions
- A **Lead Score** is derived from **Purchasing Capacity**, **Compute Intensity**, **Parallel Fit**, **Sales Timing**, and **Evidence Confidence**
- **Sales Signals** include a **Suggested Next Action**
- An **Enrichment Run** produces zero or one **Company Enrichment**
- A **Company Enrichment** produces zero or one **Lead**
- A **Lead** has exactly one **Lead Score**
- A **Company** has at most one active **Lead**
- A **Lead** can have zero or one **Outreach Draft**
- An **Outreach Draft** does not affect the **Lead Score**
- The **Apex Dashboard** presents the **Lead Queue** as the primary screen
- A **Lead Queue** contains **Leads** owned by Apex during the prototype
- The **Prototype Store** persists **Developer Signups**, **Enrichment Runs**, **Company Enrichments**, and **Leads**
- **Mock CRM Fields** can decorate a **Lead** but do not make the CRM the source of truth

## Example dialogue

> **Dev:** "When a **Developer Signup** arrives, do we enrich the person or their workplace?"
> **Domain expert:** "Apex enriches the inferred **Company** first, then creates a sales-facing **Lead** with a **Lead Score**."
>
> **Dev:** "What happens if the signup email is `dev@gmail.com`?"
> **Domain expert:** "That becomes an **Unqualified Signup** with a non-company-domain reason; it is not a failed **Lead**."
>
> **Dev:** "Is the generated outreach email part of **Company Enrichment**?"
> **Domain expert:** "No. **Company Enrichment** ends at structured signals and sales conclusions; outreach copy is generated from the resulting **Lead**."
>
> **Dev:** "Does a high **Lead Score** mean the **Company** is large?"
> **Domain expert:** "Not by itself. A high **Lead Score** means the **Lead** is worth immediate sales attention for Parallel's enterprise API offering."
>
> **Dev:** "Should the prototype write this **Lead** to Salesforce?"
> **Domain expert:** "No. Apex owns the prototype **Lead Queue** locally; **Mock CRM Fields** can make the dashboard feel realistic."
>
> **Dev:** "Does the webhook wait until Parallel finishes researching the **Company**?"
> **Domain expert:** "No. The webhook starts an **Enrichment Run** and the dashboard shows progress until the **Company Enrichment** is ready."
>
> **Dev:** "Can we call this real-time lead enrichment?"
> **Domain expert:** "Use **Near-Real-Time Enrichment**. The signup is acknowledged immediately, but company research can take minutes."
>
> **Dev:** "Can the dashboard show a **Lead Score** without sources?"
> **Domain expert:** "No. A high **Lead Score** needs an **Evidence Basis** so sales can trust why the **Lead** is worth attention."
>
> **Dev:** "Do two signups from `modal.com` create two **Leads**?"
> **Domain expert:** "No. Apex keeps both **Developer Signups**, but deduplicates to one **Company** and at most one active **Lead**."
>
> **Dev:** "If another developer signs up from the same **Company**, do we always call Parallel again?"
> **Domain expert:** "No. Apex reuses a fresh **Company Enrichment** inside the **Freshness Window**, while still updating urgency signals."
>
> **Dev:** "Should missing funding data fail the **Enrichment Run**?"
> **Domain expert:** "No. Missing non-critical data creates a **Partial Enrichment** with lower **Evidence Confidence**."
>
> **Dev:** "Is `partial` a failed **Enrichment Status**?"
> **Domain expert:** "No. `partial` means the **Enrichment Run** produced usable sales information with visible caveats."
>
> **Dev:** "Can an **Outreach Draft** boost the **Lead Score**?"
> **Domain expert:** "No. The **Lead Score** comes from enrichment signals; an **Outreach Draft** is generated afterward from the **Lead** and its **Evidence Basis**."
>
> **Dev:** "Is the **Lead Queue** where sales explores every raw enrichment field?"
> **Domain expert:** "No. The **Lead Queue** is an action queue; detailed JSON and evidence belong in the detail view."
>
> **Dev:** "Should Apex automatically upgrade hard cases to a deeper Parallel processor?"
> **Domain expert:** "No. The prototype uses **Core2x Enrichment** by default so the cost story remains credible."
>
> **Dev:** "Does the demo webhook need full signup metadata?"
> **Domain expert:** "No. A **Demo Signup Payload** only needs an email address; optional fields can decorate the resulting **Developer Signup**."
>
> **Dev:** "Should Parallel return freeform prose that we parse afterward?"
> **Domain expert:** "No. Apex asks Parallel for a **Company Enrichment** that conforms to the **Enrichment Schema**."
>
> **Dev:** "Is the prototype dashboard backed by Salesforce?"
> **Domain expert:** "No. Apex uses its own **Prototype Store** so demo **Leads** survive restarts without CRM integration."
>
> **Dev:** "Should the first screen explain what Apex is?"
> **Domain expert:** "No. The **Apex Dashboard** should open on the working **Lead Queue**, not a landing page."

## Flagged ambiguities

- "developer", "user", and "account" were used around the signup source; resolved: the trigger is a **Developer Signup**, while enrichment targets the inferred **Company**.
- "real-time" was used for the enrichment experience; resolved: Apex provides **Near-Real-Time Enrichment**, not instant enrichment.
- "partial" was resolved as a usable **Enrichment Status**, not a failed one.
