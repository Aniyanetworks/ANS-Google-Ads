# Conversion tracking + warm-pixel audience — run log

**Date:** 2026-08-18
**Account:** 3534195221 (AniyaNetworks)
**Domain:** aniyanetworks.net

## Inputs
- Conversion action name: Lead · Form Submit
- Lead value: $500 USD
- Ad group: 202407486627 (business automation agency - SKAG)
- Bid modifier: +50%

## Results
- Conversion action: `customers/3534195221/conversionActions/7724837699`
  - Global tag ID: `G-1GT819SHDX`
  - Conversion label (send_to): `AW-994193931/Ejz9CMPWvuMcEIvkiNoD`
- Site wiring added to `site/` (Next.js project):
  - `src/components/GoogleTags.tsx`
  - `src/lib/analytics.ts`
  - `src/app/thank-you/page.tsx` + `ConversionPing.tsx`
  - `src/app/business-automation-agency/LeadForm.tsx` — redirects to `/thank-you?label=...` on success
  - `.env.local` — `NEXT_PUBLIC_GTAG_ID`, `NEXT_PUBLIC_GADS_CONVERSION_LABEL`
- Verification: PASS — Playwright test (`site/scripts/verify-conversion-fires.mjs`) confirmed a real conversion beacon reached `google.com/pagead/1p-conversion/994193931/...` after form submit + redirect
  - Note: this test created one real (test) conversion event in the account's reporting data
- Warm-pixel audience: `customers/3534195221/userLists/9453017464`
  - Rule: URL contains `aniyanetworks.net`, 540-day membership lifespan
- Attached to ad group: `customers/3534195221/adGroupCriteria/202407486627~2498440083240` (+50% bid modifier)

## Next steps
1. Check Google Ads UI in 24-48h to confirm conversion status flips to "Recording conversions"
2. Audience will populate as real traffic hits aniyanetworks.net (this new `site/` project isn't deployed yet — deploy it for the pixel to actually collect visitors)
3. RLSA bid adjustments start firing once the audience has ~100 members
