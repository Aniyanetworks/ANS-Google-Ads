import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type Settings = {
  id: string;
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  mcc_customer_id: string;
};

const FIELDS: { key: keyof Omit<Settings, "id">; label: string }[] = [
  { key: "developer_token", label: "Developer Token" },
  { key: "client_id", label: "OAuth Client ID" },
  { key: "client_secret", label: "OAuth Client Secret" },
  { key: "refresh_token", label: "OAuth Refresh Token" },
  { key: "mcc_customer_id", label: "MCC Customer ID" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("google_ads_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        setError(error.message);
      } else if (data) {
        setSettings(data);
        setForm(data);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    if (!settings) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("google_ads_settings")
      .update({
        developer_token: form.developer_token,
        client_id: form.client_id,
        client_secret: form.client_secret,
        refresh_token: form.refresh_token,
        mcc_customer_id: form.mcc_customer_id,
      })
      .eq("id", settings.id);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link to="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Google Ads API Settings</h1>
        <p className="mt-1 text-slate-600">
          Account-wide credentials used by every campaign build. n8n reads these directly
          from Supabase — no need to edit workflow files when they rotate.
        </p>

        {loading && <p className="mt-8 text-slate-500">Loading...</p>}

        {!loading && !settings && !error && (
          <p className="mt-8 text-slate-500">
            No settings row found — it needs to be seeded once (ask Claude, or insert it
            directly in Supabase).
          </p>
        )}

        {settings && (
          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
              />
              Show values
            </label>

            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1 block text-sm font-medium text-slate-700">
                  {label}
                </label>
                <input
                  id={key}
                  type={reveal ? "text" : "password"}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
            ))}

            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-emerald-600">Saved.</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
