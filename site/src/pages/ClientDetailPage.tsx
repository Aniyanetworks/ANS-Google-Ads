import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import MessageThread from "../components/MessageThread";
import CampaignChat from "../components/CampaignChat";
import HintIcon from "../components/HintIcon";

type Client = { id: string; name: string; business_name: string; email: string };
type Campaign = {
  id: string;
  campaign_name: string;
  status: string;
  google_ads_customer_id: string | null;
  daily_budget_usd: number;
};
type Metric = { cost: number; conversions_value: number };
type Recommendation = {
  id: string;
  type: string;
  dollars_recoverable: number;
  status: string;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type Tab = "recommendations" | "assistant" | "messages";

const TABS: { id: Tab; label: string }[] = [
  { id: "recommendations", label: "Recommendations" },
  { id: "assistant", label: "Campaign Assistant" },
  { id: "messages", label: "Client Suggestions" },
];

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<(Campaign & { totals: Metric })[] | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("recommendations");
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    async function load() {
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select("id, name, business_name, email")
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

      const { data: recRows } = campaignIds.length
        ? await supabase
            .from("recommendations")
            .select("id, type, dollars_recoverable, status")
            .in("campaign_id", campaignIds)
            .eq("status", "open")
            .order("dollars_recoverable", { ascending: false })
        : { data: [] };

      setRecommendations(recRows ?? []);
    }

    load();
  }, [clientId]);

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
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/client/${client.id}`);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          }}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          {linkCopied ? "Copied!" : "Copy client portal link"}
        </button>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Campaigns</h2>
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
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const roas =
                      c.totals.cost > 0 ? c.totals.conversions_value / c.totals.cost : null;
                    return (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium">{c.campaign_name}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-10 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition " +
                (tab === t.id
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {t.label}
              {t.id === "recommendations" &&
                recommendations !== null &&
                recommendations.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                    {recommendations.length}
                  </span>
                )}
            </button>
          ))}
        </div>

        <section className="mt-6">
          {tab === "recommendations" &&
            (recommendations === null ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">No open recommendations.</p>
            ) : (
              <div className="space-y-3">
                {recommendations.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <p className="font-semibold">{formatType(r.type)}</p>
                    <span className="font-semibold text-emerald-600">
                      {currency.format(r.dollars_recoverable)}
                    </span>
                  </div>
                ))}
              </div>
            ))}

          {tab === "assistant" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-slate-700">Ask about this campaign</span>
                <HintIcon text="Chat with AI about this campaign — get suggestions or ask it to update the budget, pause, or resume it. Changes are applied only after you confirm." />
              </div>
              <div className="mt-3">
                <CampaignChat campaignId={campaigns?.[0]?.id ?? null} />
              </div>
            </>
          )}

          {tab === "messages" && <MessageThread clientId={clientId} />}
        </section>
      </div>
    </main>
  );
}
