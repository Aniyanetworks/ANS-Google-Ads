import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import IntakeModal from "../components/IntakeModal";
import EditClientModal from "../components/EditClientModal";
import ConfirmDialog from "../components/ConfirmDialog";

type Client = {
  id: string;
  name: string;
  business_name: string;
  email: string;
  website_url: string | null;
  phone: string | null;
  google_ads_customer_id: string | null;
};
type Campaign = {
  id: string;
  campaign_name: string;
  status: string;
  google_ads_customer_id: string | null;
  daily_budget_usd: number;
};
type Metric = { cost: number; conversions_value: number };
type CampaignWithTotals = Campaign & { totals: Metric };

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignWithTotals[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<CampaignWithTotals | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    async function load() {
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select("id, name, business_name, email, website_url, phone, google_ads_customer_id")
        .eq("id", clientId)
        .single();

      if (clientError) {
        setError(clientError.message);
        return;
      }
      setClient(clientRow);

      const { data: campaignRows, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, campaign_name, status, google_ads_customer_id, daily_budget_usd")
        .eq("client_id", clientId);

      if (campaignError) {
        setError(campaignError.message);
        return;
      }

      const campaignIds = (campaignRows ?? []).map((c) => c.id);

      const { data: metricRows } = campaignIds.length
        ? await supabase
            .from("campaign_metrics")
            .select("campaign_id, cost, conversions_value")
            .in("campaign_id", campaignIds)
        : { data: [] };

      const totalsByCampaign = new Map<string, Metric>();
      for (const m of metricRows ?? []) {
        const existing = totalsByCampaign.get(m.campaign_id) ?? { cost: 0, conversions_value: 0 };
        existing.cost += Number(m.cost);
        existing.conversions_value += Number(m.conversions_value);
        totalsByCampaign.set(m.campaign_id, existing);
      }

      setCampaigns(
        (campaignRows ?? []).map((c) => ({
          ...c,
          totals: totalsByCampaign.get(c.id) ?? { cost: 0, conversions_value: 0 },
        }))
      );
    }

    load();
  }, [clientId, refreshKey]);

  async function handleDeleteCampaign(campaign: CampaignWithTotals) {
    const webhookUrl = import.meta.env.VITE_N8N_DELETE_CAMPAIGN_WEBHOOK_URL;
    if (!webhookUrl) {
      window.alert(
        "VITE_N8N_DELETE_CAMPAIGN_WEBHOOK_URL isn't configured — can't delete this campaign yet."
      );
      return;
    }

    setDeletingCampaign(true);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      if (!res.ok) {
        window.alert(`Delete failed (${res.status}). The campaign may still exist in Google Ads.`);
        setDeletingCampaign(false);
        return;
      }
    } catch (err) {
      window.alert(
        `Delete failed: ${err instanceof Error ? err.message : "network error"}. The campaign may still exist in Google Ads.`
      );
      setDeletingCampaign(false);
      return;
    }

    setDeletingCampaign(false);
    setRefreshKey((k) => k + 1);
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </main>
    );
  }

  if (!client || !clientId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-500">Loading...</main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link to="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← All clients
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{client.name}</h1>
        <p className="text-slate-600">
          {client.business_name} · {client.email}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/client/${client.id}`);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            {linkCopied ? "Copied!" : "Copy client portal link"}
          </button>
          <Link
            to={`/dashboard/clients/${clientId}/messages`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Client Suggestions
          </Link>
          <button
            onClick={() => setShowEdit(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Edit Client
          </button>
        </div>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Campaigns</h2>
            <button
              onClick={() => setShowIntake(true)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              + Add Campaign
            </button>
          </div>
          {campaigns === null ? (
            <p className="mt-3 text-sm text-slate-500">Loading...</p>
          ) : campaigns.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No campaigns yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Daily Budget</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Conv. Value</th>
                    <th className="px-4 py-3">ROAS</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const roas =
                      c.totals.cost > 0 ? c.totals.conversions_value / c.totals.cost : null;
                    return (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            to={`/dashboard/clients/${clientId}/campaigns/${c.id}`}
                            className="hover:underline"
                          >
                            {c.campaign_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{c.status}</td>
                        <td className="px-4 py-3">{currency.format(c.daily_budget_usd)}</td>
                        <td className="px-4 py-3">{currency.format(c.totals.cost)}</td>
                        <td className="px-4 py-3">
                          {currency.format(c.totals.conversions_value)}
                        </td>
                        <td className="px-4 py-3">
                          {roas === null ? (
                            <span className="text-slate-400">No spend yet</span>
                          ) : (
                            `${roas.toFixed(2)}x`
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setPendingDelete(c)}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showIntake && (
        <IntakeModal
          existingClient={{
            id: client.id,
            name: client.name,
            googleAdsCustomerId: client.google_ads_customer_id ?? undefined,
          }}
          onClose={() => {
            setShowIntake(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showEdit && (
        <EditClientModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.campaign_name}?`}
          message="This also removes the campaign in Google Ads (if it was ever built there) — Google Ads doesn't permanently delete campaigns, it marks them removed, which is not reversible from here."
          confirmLabel={deletingCampaign ? "Deleting..." : "Delete"}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await handleDeleteCampaign(pendingDelete);
            setPendingDelete(null);
          }}
        />
      )}
    </main>
  );
}
