import IntakeForm from "../components/IntakeForm";

export default function IntakePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">New Client Intake</h1>
        <p className="mt-1 text-slate-600">
          Submit your business details to get onboarded — we'll set up your first campaign together after.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <IntakeForm />
        </div>
      </div>
    </main>
  );
}
