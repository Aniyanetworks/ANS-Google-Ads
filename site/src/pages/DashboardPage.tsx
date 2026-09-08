import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type ClientRow = {
  id: string;
  name: string;
  business_name: string;
  campaignCount: number;
  status: string | null;
  cost: number;
  conversionsValue: number;
  roas: number | null;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function DashboardPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: clientRows, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, business_name")
        .order("created_at", { ascending: false });

      if (clientsError) {
        setError(clientsError.message);
        return;
      }

      const { data: campaignRows, error: campaignsError } = await supabase
        .from("campaigns")
        .select("id, client_id, status");

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
          business_name: client.business_name,
          campaignCount: campaigns.length,
          status: campaigns[0]?.status ?? null,
          cost: totals.cost,
          conversionsValue: totals.value,
          roas: totals.cost > 0 ? totals.value / totals.cost : null,
        };
      });

      setClients(rows);
    }

    load();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Agency Dashboard</h1>
            <p className="mt-2 text-slate-600">All clients and their campaign performance.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/account"
              className="rounded-lg border-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
            >
              Account
            </Link>
            <Link
              to="/intake"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              + New Campaign
            </Link>
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
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Conv. Value</th>
                  <th className="px-4 py-3">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        to={`/dashboard/clients/${c.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-slate-500">{c.business_name}</p>
                    </td>
                    <td className="px-4 py-3">{c.campaignCount}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
