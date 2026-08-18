"use client";

import { useState } from "react";

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  cost: number;
  conversions: number;
  conversionsValue: number;
  roas: number | null;
};

export type RecommendationRow = {
  resourceName: string;
  type: string;
  campaignName: string;
  dollarsRecoverable: number;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatRecommendationType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function DashboardClient({
  campaigns,
  recommendations,
}: {
  campaigns: CampaignRow[];
  recommendations: RecommendationRow[];
}) {
  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="text-xl font-semibold">ROAS by Campaign</h2>
        {campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No campaigns found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Conv. Value</th>
                  <th className="px-4 py-3">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-slate-500">{c.status}</td>
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
      </section>

      <section>
        <h2 className="text-xl font-semibold">Top Recommendations</h2>
        <p className="mt-1 text-sm text-slate-500">Ranked by estimated dollars recoverable.</p>
        {recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No recommendations yet — Google generates these once a campaign has some serving
            history.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.resourceName} rec={rec} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: RecommendationRow }) {
  const [copied, setCopied] = useState(false);

  const prompt = `Apply this Google Ads recommendation via the API:\n\nType: ${formatRecommendationType(rec.type)}\nCampaign: ${rec.campaignName}\nResource: ${rec.resourceName}\nEstimated dollars recoverable: ${currency.format(rec.dollarsRecoverable)}\n\nReview it, and if it looks correct, apply it using RecommendationService.ApplyRecommendation.`;

  async function handleClick() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <p className="font-semibold">{formatRecommendationType(rec.type)}</p>
        <p className="text-sm text-slate-500">{rec.campaignName}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-semibold text-emerald-600">
          {currency.format(rec.dollarsRecoverable)}
        </span>
        <button
          onClick={handleClick}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          {copied ? "Copied!" : "Send to Claude"}
        </button>
      </div>
    </div>
  );
}
