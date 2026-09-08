import IntakeForm from "../components/IntakeForm";

export default function IntakePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">New Campaign Intake</h1>
        <p className="mt-1 text-slate-600">
          Submit client and campaign details to kick off a new Google Ads campaign build.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <IntakeForm />
        </div>
      </div>
    </main>
  );
}
