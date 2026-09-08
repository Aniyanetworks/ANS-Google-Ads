import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AccountPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <Link to="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Account Settings</h1>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="font-semibold text-slate-900">Change Password</h2>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              New Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">Password updated.</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Updating..." : "Update Password"}
          </button>
        </form>

        <button
          onClick={handleSignOut}
          className="mt-6 w-full rounded-lg border-2 border-slate-900 px-5 py-3 font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
