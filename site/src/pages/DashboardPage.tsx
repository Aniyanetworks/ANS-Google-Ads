import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import IntakeModal from "../components/IntakeModal";
import ConfirmDialog from "../components/ConfirmDialog";
import EditClientModal from "../components/EditClientModal";

type ClientRow = {
  id: string;
  name: string;
  email: string;
  business_name: string;
  website_url: string | null;
  phone: string | null;
  campaignCount: number;
  primaryCampaignId: string | null;
  status: string | null;
  google_ads_customer_id: string | null;
  cost: number;
  conversionsValue: number;
  roas: number | null;
};

const RETRYABLE_STATUSES = ["pending", "building", "error"];
const AUTO_SYNC_STORAGE_KEY = "dashboard-last-auto-sync";
const AUTO_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function DashboardPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ClientRow | null>(null);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const lastSync = Number(sessionStorage.getItem(AUTO_SYNC_STORAGE_KEY) ?? 0);
    if (Date.now() - lastSync < AUTO_SYNC_MIN_INTERVAL_MS) return;
    sessionStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(Date.now()));
    handleSyncNow();
    // Runs once when the dashboard is first opened — throttled via
    // sessionStorage so navigating back to the dashboard repeatedly within
    // a few minutes doesn't keep re-triggering Google Ads API calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function load() {
      const { data: clientRows, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, email, business_name, website_url, phone, google_ads_customer_id")
        .order("created_at", { ascending: false });

      if (clientsError) {
        setError(clientsError.message);
        return;
      }

      const { data: campaignRows, error: campaignsError } = await supabase
        .from("campaigns")
        .select("id, client_id, status, google_ads_customer_id");

      if (campaignsError) {
        setError(campaignsError.message);
        return;
      }

      const campaignIds = (campaignRows ?? []).map((c) => c.id);
      const { data: metricRows, error: metricsError } = campaignIds.length
        ? await supabase
            .from("campaign_metrics")
            .select("campaign_id, cost, conversions_value")
            .in("campaign_id", campaignIds)
        : { data: [], error: null };

      if (metricsError) {
        setError(metricsError.message);
        return;
      }

      const metricsByCampaign = new Map<string, { cost: number; value: number }>();
      for (const m of metricRows ?? []) {
        const existing = metricsByCampaign.get(m.campaign_id) ?? { cost: 0, value: 0 };
        existing.cost += Number(m.cost);
        existing.value += Number(m.conversions_value);
        metricsByCampaign.set(m.campaign_id, existing);
      }

      const rows: ClientRow[] = (clientRows ?? []).map((client) => {
        const campaigns = (campaignRows ?? []).filter((c) => c.client_id === client.id);
        const totals = campaigns.reduce(
          (acc, c) => {
            const m = metricsByCampaign.get(c.id);
            if (m) {
              acc.cost += m.cost;
              acc.value += m.value;
            }
            return acc;
          },
          { cost: 0, value: 0 }
        );

        return {
          id: client.id,
          name: client.name,
          email: client.email,
          business_name: client.business_name,
          website_url: client.website_url,
          phone: client.phone,
          campaignCount: campaigns.length,
          primaryCampaignId: campaigns[0]?.id ?? null,
          status: campaigns[0]?.status ?? null,
          google_ads_customer_id:
            client.google_ads_customer_id ?? campaigns[0]?.google_ads_customer_id ?? null,
          cost: totals.cost,
          conversionsValue: totals.value,
          roas: totals.cost > 0 ? totals.value / totals.cost : null,
        };
      });

      setClients(rows);
    }

    load();
  }, [refreshKey]);

  async function handleDelete(client: ClientRow) {
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      window.alert(`Delete failed: ${error.message}`);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  async function handleRetry(client: ClientRow) {
    if (!client.primaryCampaignId) return;

    const { error } = await supabase
      .from("campaigns")
      .update({ status: "pending", error_message: null })
      .eq("id", client.primaryCampaignId);

    if (error) {
      window.alert(`Retry failed: ${error.message}`);
      return;
    }

    const webhookUrl = import.meta.env.VITE_N8N_BUILD_CAMPAIGN_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: client.primaryCampaignId }),
        });
      } catch {
        // Row is reset to 'pending' either way — can be retried again or
        // built manually if the webhook call itself failed to reach n8n.
      }
    }
    setRefreshKey((k) => k + 1);
  }

  async function handleSyncNow() {
    const webhookUrl = import.meta.env.VITE_N8N_SYNC_NOW_WEBHOOK_URL;
    if (!webhookUrl) {
      window.alert("VITE_N8N_SYNC_NOW_WEBHOOK_URL isn't configured — sync can't be triggered from here yet.");
      return;
    }

    setSyncing(true);
    try {
      await fetch(webhookUrl, { method: "POST" });
    } catch {
      // The workflow may still be running server-side even if this fetch
      // itself failed to complete — reload regardless below.
    }

    // The webhook acknowledges immediately and the actual sync (several
    // Google Ads API calls per campaign) keeps running in the background,
    // so this is a best-effort wait, not a guarantee it's finished.
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setSyncing(false);
    }, 8000);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      {syncing && (
        <div className="fixed left-0 top-0 z-50 h-1 w-full overflow-hidden bg-slate-200">
          <div className="loading-bar h-full w-1/3 bg-slate-900" />
        </div>
      )}
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Agency Dashboard</h1>
            <p className="mt-2 text-slate-600">All clients and their campaign performance.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              className="rounded-lg border-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
            >
              Settings
            </Link>
            <Link
              to="/account"
              className="rounded-lg border-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
            >
              Account
            </Link>
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-2 rounded-lg border-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-60"
            >
              {syncing ? "Syncing..." : "Sync Now"}
              {syncing && (
                <span
                  role="status"
                  aria-label="Syncing"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
                />
              )}
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="rounded-lg border-2 border-slate-300 px-4 py-2 text-sm font-semibold text-slate-500 hover:border-red-300 hover:text-red-600"
            >
              Logout
            </button>
            <button
              onClick={() => setShowIntake(true)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              + New Client
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-8 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {!error && clients === null && <p className="mt-8 text-slate-500">Loading...</p>}

        {!error && clients?.length === 0 && (
          <p className="mt-8 text-slate-500">No clients yet.</p>
        )}

        {!error && clients && clients.length > 0 && (
          <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Campaigns</th>
                  <th className="px-4 py-3">Customer ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Conv. Value</th>
                  <th className="px-4 py-3">ROAS</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {syncing && (
                          <span
                            role="status"
                            aria-label="Syncing"
                            className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
                          />
                        )}
                        <div>
                          <Link
                            to={`/dashboard/clients/${c.id}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {c.name}
                          </Link>
                          <p className="text-xs text-slate-500">{c.business_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.campaignCount}</td>
                    <td className="px-4 py-3 text-slate-500">{c.google_ads_customer_id ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.status ?? "—"}</td>
                    <td className="px-4 py-3">{currency.format(c.cost)}</td>
                    <td className="px-4 py-3">{currency.format(c.conversionsValue)}</td>
                    <td className="px-4 py-3">
                      {c.roas === null ? (
                        <span className="text-slate-400">No spend yet</span>
                      ) : (
                        `${c.roas.toFixed(2)}x`
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {c.primaryCampaignId && c.status && RETRYABLE_STATUSES.includes(c.status) && (
                          <button
                            onClick={() => handleRetry(c)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => setEditingClient(c)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setPendingDelete(c)}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showIntake && (
        <IntakeModal
          onClose={() => {
            setShowIntake(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => {
            setEditingClient(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          message={`This removes ${pendingDelete.business_name} and all their campaign data from the dashboard — it does not touch anything already built in Google Ads.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await handleDelete(pendingDelete);
            setPendingDelete(null);
          }}
        />
      )}
    </main>
  );
}
