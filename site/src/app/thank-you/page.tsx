import { Suspense } from "react";
import type { Metadata } from "next";
import ConversionPing from "./ConversionPing";

export const metadata: Metadata = {
  title: "Thank You | AniyaNetworks",
};

export default function ThankYouPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center text-slate-900">
      <Suspense fallback={null}>
        <ConversionPing />
      </Suspense>
      <h1 className="text-3xl font-bold sm:text-4xl">Thanks — we got your request.</h1>
      <p className="mt-4 max-w-md text-slate-600">
        We&apos;ll be in touch within one business day to schedule your free 30-minute
        consultation.
      </p>
    </main>
  );
}
