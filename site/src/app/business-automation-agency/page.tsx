import type { Metadata } from "next";
import LeadForm from "./LeadForm";

export const metadata: Metadata = {
  title: "Business Automation Agency | AniyaNetworks",
  description:
    "AI-driven workflow automation for growing businesses. Cut admin time by 40%. Free 30-minute consultation, no commitment required.",
};

const TRUST_SIGNALS = [
  "Upwork Top Rated Plus",
  "100% Job Success Rate",
  "100+ Workflows Automated",
  "8+ Years Experience",
];

const SERVICES = [
  {
    title: "Workflow Automation",
    description:
      "Seamless automation for leads, payments, and marketing using GoHighLevel, Make.com, and n8n.",
  },
  {
    title: "AI Voice Agents",
    description:
      "24/7 AI voice agents qualify leads and answer calls automatically using VAPI and Retell.",
  },
  {
    title: "Custom Dashboards",
    description:
      "Full-stack SaaS systems and unified real-time dashboards built with Node.js and FastAPI.",
  },
  {
    title: "CRM Integration",
    description:
      "Connect GoHighLevel, HubSpot, Airtable, and more into one automated, connected system.",
  },
];

const PHONE_DISPLAY = "(437) 476-4488";
const PHONE_TEL = "+14374764488";

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function BusinessAutomationAgencyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tracking = {
    gclid: firstValue(params.gclid),
    utm_source: firstValue(params.utm_source),
    utm_medium: firstValue(params.utm_medium),
    utm_campaign: firstValue(params.utm_campaign),
    utm_term: firstValue(params.utm_term),
    utm_content: firstValue(params.utm_content),
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-lg font-bold tracking-tight">AniyaNetworks</span>
          <a
            href={`tel:${PHONE_TEL}`}
            className="hidden items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 sm:flex"
          >
            {PHONE_DISPLAY}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h1 className="text-4xl font-extrabold uppercase leading-tight tracking-tight text-slate-900 sm:text-6xl">
            Business Automation Agency
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            AI-driven workflow automation for growing businesses. Cut admin time by 40% with
            automated leads, bookings, and payments &mdash; free your team to focus on growth.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#lead-form"
              className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-700"
            >
              Book Free Consultation
            </a>
            <a
              href={`tel:${PHONE_TEL}`}
              className="rounded-lg border-2 border-slate-900 px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
            >
              Call Now &middot; {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-slate-200">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 text-center sm:grid-cols-4">
          {TRUST_SIGNALS.map((signal) => (
            <p key={signal} className="text-sm font-semibold text-slate-700">
              {signal}
            </p>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">What We Automate</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SERVICES.map((service) => (
            <div key={service.title} className="rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900">{service.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{service.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lead form + click-to-call */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <LeadForm tracking={tracking} />
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} AniyaNetworks. Toronto-based automation team serving
        businesses nationwide.
      </footer>
    </main>
  );
}
