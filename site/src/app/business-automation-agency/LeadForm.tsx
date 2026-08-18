"use client";

import { useActionState } from "react";
import { submitLead, type LeadFormState } from "@/app/actions";

const PHONE_DISPLAY = "(437) 476-4488";
const PHONE_TEL = "+14374764488";

const initialState: LeadFormState = { status: "idle", message: "" };

type TrackingParams = {
  gclid: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
};

export default function LeadForm({ tracking }: { tracking: TrackingParams }) {
  const [state, formAction, pending] = useActionState(submitLead, initialState);

  return (
    <div id="lead-form" className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 md:grid-cols-2 md:gap-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Book Your Free 30-Minute Consultation
        </h2>
        <p className="mt-3 text-slate-600">
          No commitment required. Tell us about your business and we&apos;ll show you exactly
          what automation could save your team.
        </p>

        <a
          href={`tel:${PHONE_TEL}`}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 px-5 py-3 font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
        >
          <PhoneIcon />
          Call Now &middot; {PHONE_DISPLAY}
        </a>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-1 block text-sm font-medium text-slate-700">
            What would you like to automate? (optional)
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
          />
        </div>

        {/* Hidden tracking fields */}
        <input type="hidden" name="gclid" value={tracking.gclid} />
        <input type="hidden" name="utm_source" value={tracking.utm_source} />
        <input type="hidden" name="utm_medium" value={tracking.utm_medium} />
        <input type="hidden" name="utm_campaign" value={tracking.utm_campaign} />
        <input type="hidden" name="utm_term" value={tracking.utm_term} />
        <input type="hidden" name="utm_content" value={tracking.utm_content} />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {pending ? "Sending..." : "Book Free Consultation"}
        </button>

        {state.status !== "idle" && (
          <p
            className={
              state.status === "success"
                ? "text-sm font-medium text-emerald-600"
                : "text-sm font-medium text-red-600"
            }
            role="status"
          >
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-.826 1.68l-1.293.646a11.037 11.037 0 0 0 6.036 6.036l.646-1.293a1.5 1.5 0 0 1 1.68-.826l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
