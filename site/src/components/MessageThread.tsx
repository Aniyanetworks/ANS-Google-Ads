import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ThinkingIndicator from "./ThinkingIndicator";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  from_email: string | null;
  subject: string | null;
  body: string;
  ai_draft_body: string | null;
  proposed_action: Record<string, unknown> | null;
  status: "new" | "drafted" | "approved" | "sent" | "dismissed";
  created_at: string;
  campaigns: { campaign_name: string } | { campaign_name: string }[] | null;
};

export default function MessageThread({
  clientId,
  campaignId,
}: {
  clientId: string;
  campaignId?: string;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [clientId, campaignId]);

  useEffect(() => {
    if (!messages?.some((m) => m.status === "new")) return;
    // Poll while the AI draft is still pending so "Thinking..." resolves on
    // its own once n8n finishes, without the agency needing to reload.
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [messages]);

  async function load() {
    let query = supabase
      .from("messages")
      .select(
        "id, direction, from_email, subject, body, ai_draft_body, proposed_action, status, created_at, campaigns(campaign_name)"
      )
      .eq("client_id", clientId);

    if (campaignId) query = query.eq("campaign_id", campaignId);

    const { data } = await query.order("created_at", { ascending: true });

    const rows = (data ?? []) as unknown as Message[];
    setMessages(rows);
    const nextDrafts: Record<string, string> = {};
    for (const m of rows) {
      if (m.status === "drafted" && m.ai_draft_body) nextDrafts[m.id] = m.ai_draft_body;
    }
    setDrafts(nextDrafts);
  }

  async function approveAndSend(message: Message) {
    setSendingId(message.id);
    const finalBody = drafts[message.id] ?? message.ai_draft_body ?? "";

    await supabase
      .from("messages")
      .update({ ai_draft_body: finalBody, status: "approved" })
      .eq("id", message.id);

    const webhookUrl = import.meta.env.VITE_N8N_SEND_REPLY_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: message.id }),
        });
      } catch {
        // n8n will still see status='approved' and can be retried/polled.
      }
    }

    setSendingId(null);
    load();
  }

  if (messages === null) return <p className="text-sm text-slate-500">Loading messages...</p>;
  if (messages.length === 0)
    return (
      <p className="text-sm text-slate-500">
        {campaignId ? "No messages about this campaign yet." : "No messages from this client yet."}
      </p>
    );

  return (
    <div className="space-y-4">
      {messages.map((m) => {
        const campaignName = Array.isArray(m.campaigns)
          ? m.campaigns[0]?.campaign_name
          : m.campaigns?.campaign_name;
        return (
        <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {m.direction === "inbound" ? m.from_email ?? "Client" : "Agency"}
              {!campaignId && campaignName && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {campaignName}
                </span>
              )}
            </span>
            <span>{new Date(m.created_at).toLocaleString()}</span>
          </div>
          {m.subject && <p className="mt-1 text-sm font-medium text-slate-900">{m.subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>

          {m.direction === "inbound" && m.status === "new" && (
            <div className="mt-3">
              <ThinkingIndicator />
            </div>
          )}

          {m.status === "drafted" && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase text-amber-700">AI Draft Reply</p>
              <textarea
                value={drafts[m.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                rows={4}
                className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
              {m.proposed_action && (
                <p className="mt-2 text-xs text-amber-700">
                  Proposed action: <code>{JSON.stringify(m.proposed_action)}</code>
                </p>
              )}
              <button
                onClick={() => approveAndSend(m)}
                disabled={sendingId === m.id}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {sendingId === m.id ? "Sending..." : "Approve & Send"}
              </button>
            </div>
          )}

          {m.status === "approved" && (
            <p className="mt-2 text-xs font-medium text-blue-600">Approved — sending...</p>
          )}
          {m.status === "sent" && (
            <p className="mt-2 text-xs font-medium text-emerald-600">Sent</p>
          )}
        </div>
        );
      })}
    </div>
  );
}
