import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type PortalRow = {
  business_name: string;
  message_id: string | null;
  direction: "inbound" | "outbound" | null;
  body: string | null;
  status: string | null;
  created_at: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
};

type CampaignOption = { id: string; campaign_name: string };

export default function ClientPortalPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clientId) load();
  }, [clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function load() {
    if (!clientId) return;
    const { data, error } = await supabase.rpc("get_client_portal_data", {
      p_client_id: clientId,
    });

    if (error || !data || data.length === 0) {
      setNotFound(true);
      return;
    }

    const rows = data as PortalRow[];
    setBusinessName(rows[0].business_name);
    setMessages(rows.filter((r) => r.message_id !== null));

    const { data: campaignRows } = await supabase.rpc("get_client_campaigns", {
      p_client_id: clientId,
    });
    const options = (campaignRows as CampaignOption[]) ?? [];
    setCampaigns(options);
    setSelectedCampaignId((prev) =>
      prev && options.some((c) => c.id === prev) ? prev : options[0]?.id ?? ""
    );
  }

  async function sendMessage() {
    if (!clientId || !input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");

    const { data, error } = await supabase
      .rpc("insert_client_message", {
        p_client_id: clientId,
        p_body: text,
        p_campaign_id: selectedCampaignId || null,
      })
      .single();

    if (!error && data) {
      const webhookUrl = import.meta.env.VITE_N8N_CLIENT_MESSAGE_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message_id: (data as { id: string }).id }),
          });
        } catch {
          // The message is saved regardless — the agency can still see and
          // reply to it from the dashboard even if this call failed.
        }
      }
    }

    await load();
    setSending(false);
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-slate-500">
          We couldn't find this page. Double check the link your account manager sent you.
        </p>
      </main>
    );
  }

  if (!businessName) {
    return <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-500">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">{businessName}</h1>
        <p className="text-sm text-slate-500">Message your account manager here.</p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
            {messages !== null && messages.length === 0 && (
              <p className="text-sm text-slate-500">No messages yet — say hello below.</p>
            )}

            {messages?.map((m) => (
              <div
                key={m.message_id}
                className={
                  "flex flex-col " + (m.direction === "inbound" ? "items-end" : "items-start")
                }
              >
                {campaigns.length > 1 && m.campaign_name && (
                  <span className="mb-1 px-1 text-xs text-slate-400">{m.campaign_name}</span>
                )}
                <div
                  className={
                    m.direction === "inbound"
                      ? "max-w-[80%] rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white"
                      : "max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800"
                  }
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {campaigns.length > 1 && (
            <div className="border-t border-slate-200 px-3 pt-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Which campaign is this about?
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={"flex gap-2 p-3 " + (campaigns.length > 1 ? "" : "border-t border-slate-200")}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
