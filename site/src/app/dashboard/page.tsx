import type { Metadata } from "next";
import { fetchDashboardData } from "@/lib/googleAdsClient";
import DashboardClient, { type CampaignRow, type RecommendationRow } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Ads Dashboard | AniyaNetworks",
};

export const dynamic = "force-dynamic";

function buildCampaignRows(
  campaigns: Awaited<ReturnType<typeof fetchDashboardData>>["campaigns"]
): CampaignRow[] {
  return campaigns.map((c) => {
    const cost = c.costMicros / 1_000_000;
    const roas = cost > 0 ? c.conversionsValue / cost : null;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      cost,
      conversions: c.conversions,
      conversionsValue: c.conversionsValue,
      roas,
    };
  });
}

function buildRecommendationRows(
  recommendations: Awaited<ReturnType<typeof fetchDashboardData>>["recommendations"],
  campaigns: CampaignRow[]
): RecommendationRow[] {
  const nameById = new Map(campaigns.map((c) => [c.id, c.name]));

  const rows = recommendations.map((rec) => {
    const baseCost = rec.baseCostMicros / 1_000_000;
    const potentialCost = rec.potentialCostMicros / 1_000_000;
    const valueGain = rec.potentialConversionsValue - rec.baseConversionsValue;
    const costSavings = baseCost - potentialCost;
    const dollarsRecoverable = valueGain > 0 ? valueGain : Math.max(costSavings, 0);

    const campaignId = rec.campaign ? rec.campaign.split("/campaigns/")[1] : undefined;

    return {
      resourceName: rec.resourceName,
      type: rec.type,
      campaignName: campaignId ? nameById.get(campaignId) ?? "Account-level" : "Account-level",
      dollarsRecoverable,
    };
  });

  return rows.sort((a, b) => b.dollarsRecoverable - a.dollarsRecoverable);
}

export default async function DashboardPage() {
  let campaigns: CampaignRow[] = [];
  let recommendations: RecommendationRow[] = [];
  let error: string | null = null;

  try {
    const data = await fetchDashboardData();
    campaigns = buildCampaignRows(data.campaigns);
    recommendations = buildRecommendationRows(data.recommendations, campaigns);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold">Ads Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Live data from Google Ads account 3534195221 (AniyaNetworks) — last 30 days.
        </p>

        {error ? (
          <div className="mt-8 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            <p className="font-semibold">Failed to load Google Ads data</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : (
          <DashboardClient campaigns={campaigns} recommendations={recommendations} />
        )}
      </div>
    </main>
  );
}
