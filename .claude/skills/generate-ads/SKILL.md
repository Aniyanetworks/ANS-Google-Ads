---
name: generate-ads
description: Generate high-performing Google Ads RSAs and campaign assets (sitelinks, callouts, structured snippets) for a given keyword/SKAG, following the anatomy-of-a-good-ad.md and ad-assets-best-practices.md rubrics. Use when the user asks to write ad copy, build RSAs, or add ad assets for a campaign.
---

# Generate Ads

Full rubric this skill follows:

@../../../code/anatomy-of-a-good-ad.md
@../../../code/ad-assets-best-practices.md

## What this skill does

Given a keyword/SKAG (and optionally a target campaign/ad group), produces:
1. **3 RSAs** — each with 15 headlines (3 pinned keyword variants + 12 unpinned) and 4 descriptions, fully compliant with the anatomy doc's rules
2. **Campaign-level assets** — 4-8 sitelinks, 8-12 callouts, 2 structured-snippet headers, per the assets doc

Everything is grounded in the business's **real** content — services actually offered, real trust signals (ratings, years in business, certifications), real page URLs. Never invent stats, testimonials, or claims not verifiable from the business's own site or user-provided facts.

## Step 0 — Gather inputs (ask if not already known from context)

- The exact keyword / SKAG this is for (must match ad headline word-for-word per Quality Score rules)
- The business's real site content — fetch it if a URL is available, don't guess
- Real trust signals: ratings, years in business, certifications, guarantees, notable stats — only ones that are actually verifiable
- Real page URLs for sitelinks (services page, about page, booking/contact page, etc.) — never invent URLs
- Final URL for the ads (landing page, or homepage as placeholder if no dedicated LP exists yet)
- Whether to push directly to Google Ads via the API (needs an existing campaign + ad group), or just produce the copy for review

## Step 1 — Generate 3 RSAs

Follow `anatomy-of-a-good-ad.md` §1-5 exactly:

- **3 pinned headlines** (slot 1 only) — keyword + location/modifier variants, e.g. `[Keyword]`, `[Modifier] [Keyword]`, `[Keyword] [Location]`
- **12 unpinned headlines** per RSA, covering at least 5 of the 6 patterns in §2: offer/USP, trust/social proof, urgency/scarcity (skip if it can't be truthful — don't fabricate urgency for a business that doesn't have any), specific guarantees, call-to-action. Give each of the 3 RSAs a distinct angle (e.g. efficiency, technical/trust, credibility) so they're not near-duplicates of each other.
- **4 descriptions** per RSA, each ≤90 chars, structured as `[Service promise] · [Trust signal] · [CTA]`
- Hard editorial rules (§5-6): no exclamation marks in headlines, no ALL CAPS words, no emoji/symbols beyond `·` and `&`, no unsubstantiated superlatives (`#1`, `best`, `top`) without real proof, no phone numbers in headlines, no gimmicky spacing
- Character limits: headlines ≤30 chars, descriptions ≤90 chars

Run the §8 self-review checklist on every headline/description before presenting or pushing.

## Step 2 — Generate campaign assets

Follow `ad-assets-best-practices.md` §2 and the example config in §6:

- **Sitelinks** (4-8): each points to a real, distinct page. Title ≤25 chars (aim 12-15), description lines ≤35 chars each. Never use generic labels like "Learn More" or bare "Contact."
- **Callouts** (8-12): ≤25 chars each, covering 4+ angles (speed, trust, value, guarantee). Don't repeat headline/description text verbatim.
- **Structured snippets** (2 headers): use the exact Google-recognized header string (e.g. `"Service catalog"`, `"Types"` — not enum-style constants). 4-10 values per header, ≤25 chars each, every value must be something the business actually offers.
- Business name/logo: note that these aren't settable via `AssetService` for Search campaigns in the current API version — they're managed through account-level Advertiser Identity in the UI. Don't attempt to create a `business_name_asset`.

Run the §5 self-review checklist before presenting or pushing.

## Step 3 — Output

If pushing to Google Ads via API:
- Reuse the account's working `.env` credentials and connection pattern already established in this project (`code/test_connection.py` confirms the connection works)
- Create RSAs as `AdGroupAdOperation` with `status = PAUSED` — never create live/enabled ads without explicit user confirmation
- Create assets via `AssetService.MutateAssets`, then link to the campaign via `CampaignAssetService.MutateCampaignAssets` with the correct `AssetFieldType` (`SITELINK`, `CALLOUT`, `STRUCTURED_SNIPPET`)
- Known proto-plus quirks from this project's history: use `campaign._pb.maximize_conversions.SetInParent()` instead of `CopyFrom()` for oneof fields; build nested repeated messages by assigning into the field directly rather than constructing a standalone message and calling `.CopyFrom()`
- Report back exactly what was created, with resource names, and remind the user everything is PAUSED pending their review

If not pushing: present the 3 RSAs and the asset lists in a clear, copy-pasteable format, and note that self-review checklists passed.
