// Server-only. Calls the Python `google-ads` client as a subprocess rather
// than the Google Ads REST API directly: this account uses direct (non-MCC)
// access, and the REST gateway requires a login-customer-id header to pass
// its initial auth gate even though gRPC doesn't — since there's no MCC
// that actually manages this account, no login-customer-id value satisfies
// both the gate and real permission checks over REST. The Python client
// (gRPC transport) works correctly without it, so we shell out to it.
//
// Caveat: this only works on a persistent Node server with Python + the
// google-ads package available (e.g. local dev, a self-hosted server) — it
// will NOT work on serverless platforms like Vercel. Revisit if deploying
// there: either resolve the REST quirk with Google support, or run this
// behind a small persistent API service instead.

import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

// code/dashboard_data.py lives at the repo root's code/ dir, two levels up
// from this site/ project.
const SCRIPT_PATH = path.resolve(process.cwd(), "..", "code", "dashboard_data.py");

export type CampaignApiRow = {
  id: string;
  name: string;
  status: string;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
};

export type RecommendationApiRow = {
  resourceName: string;
  type: string;
  campaign: string;
  baseCostMicros: number;
  baseConversionsValue: number;
  potentialCostMicros: number;
  potentialConversionsValue: number;
};

export type DashboardData = {
  campaigns: CampaignApiRow[];
  recommendations: RecommendationApiRow[];
};

export async function fetchDashboardData(): Promise<DashboardData> {
  const { stdout } = await execFileAsync("py", [SCRIPT_PATH], {
    cwd: path.resolve(process.cwd(), ".."),
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as DashboardData;
}
