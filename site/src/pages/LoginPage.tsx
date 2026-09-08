import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/useAuth";

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-bold text-slate-900">Agency Login</h1>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}
