import { useState, type FormEvent, type RefObject } from "react";
import { supabase } from "../lib/supabaseClient";
import HintIcon from "./HintIcon";
import LocationAutocomplete from "./LocationAutocomplete";

const CAMPAIGN_TYPES = ["Search", "Display", "Performance Max", "Video"];
const BIDDING_STRATEGIES = [
  "Maximize Clicks",
  "Maximize Conversions",
  "Target CPA",
  "Manual CPC",
];
const AD_SCHEDULES = ["24 Hours", "Business Hours (Mon-Fri 9am-6pm)", "Custom"];

export default function IntakeForm({
  onSuccess,
  formRef,
  existingClient,
}: {
  onSuccess?: () => void;
  formRef?: RefObject<HTMLFormElement | null>;
  existingClient?: { id: string; name: string; googleAdsCustomerId?: string };
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [syncTriggered, setSyncTriggered] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    if (!existingClient) {
      const googleAdsCustomerId =
        (form.get("googleAdsCustomerId") as string)?.replace(/[^0-9]/g, "") || null;

      const { error: clientError } = await supabase.from("clients").insert({
        id: crypto.randomUUID(),
        name: form.get("clientName"),
        email: form.get("clientEmail"),
        business_name: form.get("businessName"),
        website_url: form.get("websiteUrl"),
        phone: form.get("phone") || null,
        google_ads_customer_id: googleAdsCustomerId,
      });

      if (clientError) {
        setError(clientError.message);
        setSubmitting(false);
        return;
      }

      // A Customer ID means there are real campaigns in Google Ads for this
      // client to discover — kick off a sync immediately instead of making
      // the agency wait for the next scheduled run or click "Sync Now"
      // themselves.
      const syncWebhookUrl = import.meta.env.VITE_N8N_SYNC_NOW_WEBHOOK_URL;
      if (googleAdsCustomerId && syncWebhookUrl) {
        try {
          await fetch(syncWebhookUrl, { method: "POST" });
          setSyncTriggered(true);
        } catch {
          // Non-fatal: the client row exists either way and will still be
          // picked up by the next scheduled sync or a manual "Sync Now".
        }
      }

      setSubmitting(false);
      setSuccess(true);
      return;
    }

    const campaignId = crypto.randomUUID();
    const targetedLocations = (form.get("targetedLocations") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const languages = (form.get("languages") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (targetedLocations.length === 0) {
      setError("Pick at least one targeted location.");
      setSubmitting(false);
      return;
    }

    const { error: campaignError } = await supabase.from("campaigns").insert({
      id: campaignId,
      client_id: existingClient.id,
      google_ads_customer_id:
        (form.get("googleAdsCustomerId") as string)?.replace(/[^0-9]/g, "") || null,
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
      <div className="py-10 text-center">
        <h2 className="text-xl font-bold text-slate-900">
          {existingClient ? "Campaign request submitted" : "Client added"}
        </h2>
        <p className="mt-2 text-slate-600">
          {existingClient
            ? "We'll be building this campaign shortly."
            : syncTriggered
              ? "Syncing their Google Ads account now — campaigns will appear shortly."
              : "Add a campaign for this client whenever you're ready."}
        </p>
        {onSuccess && (
          <button
            onClick={onSuccess}
            className="mt-6 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  if (!existingClient) {
    return (
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client's Name" name="clientName" required />
          <Field label="Client's Email" name="clientEmail" type="email" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Business Name" name="businessName" required />
          <Field label="Website URL" name="websiteUrl" type="url" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" name="phone" />
          <Field
            label="Google Ads Account ID"
            name="googleAdsCustomerId"
            placeholder="e.g. 123-456-7890"
            hint="Must already be linked under our MCC (Manager account) before a campaign can be built into it."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Create Client"}
        </button>
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm font-medium text-slate-500">
        New campaign for <span className="text-slate-900">{existingClient.name}</span>
      </p>

      <div className="space-y-4">
        <Field
          label="Google Ads Account ID"
          name="googleAdsCustomerId"
          placeholder="e.g. 123-456-7890"
          defaultValue={existingClient.googleAdsCustomerId}
          hint="Must already be linked under our MCC (Manager account) before a campaign can be built into it. Defaults to this client's existing account."
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Campaign Name" name="campaignName" required />
          <Field
            label="Primary Keyword"
            name="primaryKeyword"
            placeholder="e.g. emergency plumber toronto"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Campaign Goal" name="campaignGoal" placeholder="e.g. Leads" required />
          <SelectField label="Campaign Type" name="campaignType" options={CAMPAIGN_TYPES} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Average Daily Budget (USD)"
            name="dailyBudget"
            type="number"
            min="1"
            step="0.01"
            required
          />
          <SelectField label="Bidding" name="biddingStrategy" options={BIDDING_STRATEGIES} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Languages (comma-separated)"
            name="languages"
            defaultValue="English"
            required
          />
          <LocationAutocomplete name="targetedLocations" />
        </div>

        <SelectField label="Ad Schedule" name="adSchedule" options={AD_SCHEDULES} required />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Campaign Request"}
        </button>
      </div>
    </form>
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
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  min?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {label}
        {hint && <HintIcon text={hint} />}
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

function SelectField({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        name={name}
        required={required}
        defaultValue={options[0]}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
