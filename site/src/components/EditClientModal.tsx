import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

export type EditableClient = {
  id: string;
  name: string;
  email: string;
  business_name: string;
  website_url: string | null;
  phone: string | null;
  google_ads_customer_id: string | null;
};

export default function EditClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: EditableClient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        name: form.get("name"),
        email: form.get("email"),
        business_name: form.get("businessName"),
        website_url: form.get("websiteUrl") || null,
        phone: form.get("phone") || null,
        google_ads_customer_id:
          (form.get("googleAdsCustomerId") as string)?.replace(/[^0-9]/g, "") || null,
      })
      .eq("id", client.id);

    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-client-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="edit-client-modal-title" className="text-xl font-bold text-slate-900">
              Edit Client
            </h2>
            <p className="mt-1 text-sm text-slate-600">Update {client.name}'s details.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client's Name" name="name" defaultValue={client.name} required />
            <Field
              label="Client's Email"
              name="email"
              type="email"
              defaultValue={client.email}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Business Name"
              name="businessName"
              defaultValue={client.business_name}
              required
            />
            <Field
              label="Website URL"
              name="websiteUrl"
              type="url"
              defaultValue={client.website_url ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" name="phone" defaultValue={client.phone ?? ""} />
            <Field
              label="Google Ads Account ID"
              name="googleAdsCustomerId"
              defaultValue={client.google_ads_customer_id ?? ""}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
      />
    </div>
  );
}
