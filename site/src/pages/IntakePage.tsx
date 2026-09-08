import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

const CAMPAIGN_TYPES = ["Search", "Display", "Performance Max", "Video"];
const BIDDING_STRATEGIES = [
  "Maximize Clicks",
  "Maximize Conversions",
  "Target CPA",
  "Manual CPC",
];
const AD_SCHEDULES = ["24 Hours", "Business Hours (Mon-Fri 9am-6pm)", "Custom"];

export default function IntakePage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const clientId = crypto.randomUUID();
    const campaignId = crypto.randomUUID();

    const targetedLocations = (form.get("targetedLocations") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const languages = (form.get("languages") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { error: clientError } = await supabase.from("clients").insert({
      id: clientId,
      name: form.get("clientName"),
      email: form.get("clientEmail"),
      business_name: form.get("businessName"),
      website_url: form.get("websiteUrl"),
      phone: form.get("phone") || null,
    });

    if (clientError) {
      setError(clientError.message);
      setSubmitting(false);
      return;
    }

    const { error: campaignError } = await supabase.from("campaigns").insert({
      id: campaignId,
      client_id: clientId,
      google_ads_customer_id: form.get("googleAdsCustomerId") || null,
      campaign_name: form.get("campaignName"),
      primary_keyword: form.get("primaryKeyword"),
      goal: form.get("campaignGoal"),
      campaign_type: form.get("campaignType"),
      daily_budget_usd: Number(form.get("dailyBudget")),
      bidding_strategy: form.get("biddingStrategy"),
      languages,
      targeted_locations: targetedLocations,
      ad_schedule: form.get("adSchedule"),
      status: "pending",
    });

    if (campaignError) {
      setError(campaignError.message);
      setSubmitting(false);
      return;
    }

    // Kick off the n8n campaign-build workflow, if configured.
    const webhookUrl = import.meta.env.VITE_N8N_BUILD_CAMPAIGN_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId }),
        });
      } catch {
        // Non-fatal: the campaign row exists either way and can be built
        // manually or picked up by a retry later.
      }
    }

    setSubmitting(false);
    setSuccess(true);
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaign request submitted</h1>
          <p className="mt-2 text-slate-600">We'll be building this campaign shortly.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">New Campaign Intake</h1>
        <p className="mt-1 text-slate-600">
          Submit client and campaign details to kick off a new Google Ads campaign build.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold text-slate-900">
              Business and Client Information
            </legend>
            <Field label="Client's Name" name="clientName" required />
            <Field label="Client's Email" name="clientEmail" type="email" required />
            <Field label="Business Name" name="businessName" required />
            <Field label="Website URL" name="websiteUrl" type="url" required />
            <Field label="Phone" name="phone" />
            <Field
              label="Google Ads Account ID"
              name="googleAdsCustomerId"
              placeholder="e.g. 123-456-7890 (must already be linked under our MCC)"
            />
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold text-slate-900">Campaign Details</legend>
            <Field label="Campaign Name" name="campaignName" required />
            <Field
              label="Primary Keyword"
              name="primaryKeyword"
              placeholder="e.g. emergency plumber toronto"
              required
            />
            <Field label="Campaign Goal" name="campaignGoal" placeholder="e.g. Leads" required />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Campaign Type
              </label>
              <select
                name="campaignType"
                required
                defaultValue={CAMPAIGN_TYPES[0]}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
              >
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="Average Daily Budget (USD)"
              name="dailyBudget"
              type="number"
              min="1"
              step="0.01"
              required
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Bidding</label>
              <select
                name="biddingStrategy"
                required
                defaultValue={BIDDING_STRATEGIES[0]}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
              >
                {BIDDING_STRATEGIES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="Languages (comma-separated)"
              name="languages"
              defaultValue="English"
              required
            />
            <Field
              label="Targeted Locations (comma-separated)"
              name="targetedLocations"
              placeholder="e.g. Cambridge, Kitchener, Waterloo, Guelph"
              required
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ad Schedule
              </label>
              <select
                name="adSchedule"
                required
                defaultValue={AD_SCHEDULES[0]}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
              >
                {AD_SCHEDULES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Campaign Request"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  defaultValue,
  min,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  min?: string;
  step?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        step={step}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
      />
    </div>
  );
}
