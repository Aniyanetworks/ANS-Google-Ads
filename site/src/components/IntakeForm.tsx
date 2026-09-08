import { useState, type FormEvent, type RefObject } from "react";
import { supabase } from "../lib/supabaseClient";

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
}: {
  onSuccess?: () => void;
  formRef?: RefObject<HTMLFormElement | null>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function goToStep2(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    // Step 2's fields are hidden (display:none) while on step 1, so
    // reportValidity() here only checks step 1's visible required fields.
    if (form && !form.reportValidity()) return;
    setStep(2);
  }

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
        <h2 className="text-xl font-bold text-slate-900">Campaign request submitted</h2>
        <p className="mt-2 text-slate-600">We'll be building this campaign shortly.</p>
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <StepDot active={step === 1} done={step > 1} label="1" />
        <span className={step === 1 ? "text-slate-900" : ""}>Business &amp; Client</span>
        <span className="flex-1 border-t border-slate-200" />
        <StepDot active={step === 2} done={false} label="2" />
        <span className={step === 2 ? "text-slate-900" : ""}>Campaign Details</span>
      </div>

      <div className={step === 1 ? "space-y-4" : "hidden"}>
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

        <button
          type="button"
          onClick={goToStep2}
          className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700"
        >
          Next: Campaign Details
        </button>
      </div>

      <div className={step === 2 ? "space-y-4" : "hidden"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Campaign Name" name="campaignName" required={step === 2} />
          <Field
            label="Primary Keyword"
            name="primaryKeyword"
            placeholder="e.g. emergency plumber toronto"
            required={step === 2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Campaign Goal"
            name="campaignGoal"
            placeholder="e.g. Leads"
            required={step === 2}
          />
          <SelectField
            label="Campaign Type"
            name="campaignType"
            options={CAMPAIGN_TYPES}
            required={step === 2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Average Daily Budget (USD)"
            name="dailyBudget"
            type="number"
            min="1"
            step="0.01"
            required={step === 2}
          />
          <SelectField
            label="Bidding"
            name="biddingStrategy"
            options={BIDDING_STRATEGIES}
            required={step === 2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Languages (comma-separated)"
            name="languages"
            defaultValue="English"
            required={step === 2}
          />
          <Field
            label="Targeted Locations (comma-separated)"
            name="targetedLocations"
            placeholder="e.g. Cambridge, Kitchener, Waterloo"
            required={step === 2}
          />
        </div>

        <SelectField
          label="Ad Schedule"
          name="adSchedule"
          options={AD_SCHEDULES}
          required={step === 2}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full rounded-lg border-2 border-slate-900 px-5 py-3 font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Campaign Request"}
          </button>
        </div>
      </div>
    </form>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
        (active || done ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500")
      }
    >
      {label}
    </span>
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

function HintIcon({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0 cursor-help text-slate-400 hover:text-slate-600"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Z"
          clipRule="evenodd"
        />
      </svg>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
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
