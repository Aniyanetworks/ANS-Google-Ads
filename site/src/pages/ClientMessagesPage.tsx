import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import MessageThread from "../components/MessageThread";

type Client = { id: string; name: string };

export default function ClientMessagesPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    async function load() {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .single();

      if (error) {
        setError(error.message);
        return;
      }
      setClient(data);
    }

    load();
  }, [clientId]);

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </main>
    );
  }

  if (!client || !clientId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-500">Loading...</main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Link to={`/dashboard/clients/${clientId}`} className="text-sm text-slate-500 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Client Suggestions</h1>
        <p className="text-slate-600">Messages {client.name} has sent in through their portal.</p>

        <div className="mt-8">
          <MessageThread clientId={clientId} />
        </div>
      </div>
    </main>
  );
}
