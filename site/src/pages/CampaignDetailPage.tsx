import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import CampaignChat from "../components/CampaignChat";
import HintIcon from "../components/HintIcon";
import MessageThread from "../components/MessageThread";

type Client = { id: string; name: string };
type Campaign = {
  id: string;
  campaign_name: string;
  status: string;
  google_ads_customer_id: string | null;
  daily_budget_usd: number;
};
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
  { id: "assistant", label: "Campaign Assistant" },
  { id: "recommendations", label: "Recommendations" },
  { id: "messages", label: "Client Suggestions" },
];

export default function CampaignDetailPage() {
  const { clientId, campaignId } = useParams<{ clientId: string; campaignId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [totals, setTotals] = useState({ cost: 0, conversions_value: 0 });
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("assistant");

  useEffect(() => {
    if (!clientId || !campaignId) return;

    async function load() {
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .single();

      if (clientError) {
        setError(clientError.message);
        return;
      }
      setClient(clientRow);

      const { data: campaignRow, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, campaign_name, status, google_ads_customer_id, daily_budget_usd")
        .eq("id", campaignId)
        .eq("client_id", clientId)
        .single();

      if (campaignError) {
        setError(campaignError.message);
        return;
      }
      setCampaign(campaignRow);

      const { data: metricRows } = await supabase
        .from("campaign_metrics")
        .select("cost, conversions_value")
        .eq("campaign_id", campaignId);

      const totalsAcc = { cost: 0, conversions_value: 0 };
      for (const m of metricRows ?? []) {
        totalsAcc.cost += Number(m.cost);
        totalsAcc.conversions_value += Number(m.conversions_value);
      }
      setTotals(totalsAcc);

      const { data: recRows } = await supabase
        .from("recommendations")
        .select("id, type, dollars_recoverable, status")
        .eq("campaign_id", campaignId)
        .eq("status", "open")
        .order("dollars_recoverable", { ascending: false });

      setRecommendations(recRows ?? []);
    }

    load();
  }, [clientId, campaignId]);

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </main>
    );
  }

  if (!client || !campaign || !clientId || !campaignId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-500">Loading...</main>
    );
  }

  const roas = totals.cost > 0 ? totals.conversions_value / totals.cost : null;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link to={`/dashboard/clients/${clientId}`} className="text-sm text-slate-500 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{campaign.campaign_name}</h1>
        <p className="text-slate-600">
          {campaign.status} · {currency.format(campaign.daily_budget_usd)}/day
          {campaign.google_ads_customer_id ? ` · Customer ID ${campaign.google_ads_customer_id}` : ""}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <StatCard label="Cost" value={currency.format(totals.cost)} />
          <StatCard label="Conv. Value" value={currency.format(totals.conversions_value)} />
          <StatCard label="ROAS" value={roas === null ? "No spend yet" : `${roas.toFixed(2)}x`} />
        </div>

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
                <CampaignChat campaignId={campaignId} />
              </div>
            </>
          )}

          {tab === "messages" && <MessageThread clientId={clientId} campaignId={campaignId} />}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
