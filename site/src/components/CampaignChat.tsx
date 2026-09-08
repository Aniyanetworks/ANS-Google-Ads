import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type ProposedAction = {
  action_type: "update_daily_budget" | "pause_campaign" | "resume_campaign";
  daily_budget_usd: number | null;
  reason: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposed_action: ProposedAction | null;
  action_status: "proposed" | "applied" | "dismissed" | null;
  created_at: string;
};

function describeAction(action: ProposedAction) {
  switch (action.action_type) {
    case "update_daily_budget":
      return `Set daily budget to $${action.daily_budget_usd}`;
    case "pause_campaign":
      return "Pause this campaign";
    case "resume_campaign":
      return "Resume this campaign";
    default:
      return action.action_type;
  }
}

export default function CampaignChat({ campaignId }: { campaignId: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (campaignId) load();
  }, [campaignId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function load() {
    if (!campaignId) return;
    const { data } = await supabase
      .from("campaign_chat_messages")
      .select("id, role, content, proposed_action, action_status, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    setMessages(data ?? []);
  }

  async function sendMessage() {
    if (!campaignId || !input.trim() || sending) return;
    const webhookUrl = import.meta.env.VITE_N8N_CAMPAIGN_CHAT_WEBHOOK_URL;
    if (!webhookUrl) {
      window.alert("VITE_N8N_CAMPAIGN_CHAT_WEBHOOK_URL isn't configured — the assistant can't run yet.");
      return;
    }

    setSending(true);
    const text = input.trim();
    setInput("");

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, message: text }),
      });
    } catch {
      // Fall through to reload either way — the user turn is persisted
      // server-side regardless of whether this fetch itself succeeded.
    }

    await load();
    setSending(false);
  }

  async function confirmAction(message: ChatMessage) {
    if (!campaignId || !message.proposed_action) return;
    const webhookUrl = import.meta.env.VITE_N8N_APPLY_CAMPAIGN_ACTION_WEBHOOK_URL;
    if (!webhookUrl) {
      window.alert(
        "VITE_N8N_APPLY_CAMPAIGN_ACTION_WEBHOOK_URL isn't configured — can't apply this yet."
      );
      return;
    }

    setActingOnId(message.id);
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          chat_message_id: message.id,
          proposed_action: message.proposed_action,
        }),
      });
    } catch {
      // Reload regardless — if it actually applied, the row will show it.
    }
    await load();
    setActingOnId(null);
  }

  async function dismissAction(message: ChatMessage) {
    setActingOnId(message.id);
    await supabase
      .from("campaign_chat_messages")
      .update({ action_status: "dismissed" })
      .eq("id", message.id);
    await load();
    setActingOnId(null);
  }

  if (!campaignId) {
    return (
      <p className="text-sm text-slate-500">
        No campaign yet — the assistant needs a built campaign to work with.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="max-h-96 space-y-3 overflow-y-auto p-4">
        {messages === null && <p className="text-sm text-slate-500">Loading...</p>}
        {messages !== null && messages.length === 0 && (
          <p className="text-sm text-slate-500">No messages yet — ask something below.</p>
        )}

        {messages?.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white"
                  : "max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800"
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>

              {m.proposed_action && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-slate-800">
                  <p className="text-xs font-semibold uppercase text-amber-700">
                    Proposed: {describeAction(m.proposed_action)}
                  </p>
                  <p className="mt-1 text-xs text-amber-700">{m.proposed_action.reason}</p>

                  {m.action_status === "proposed" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => confirmAction(m)}
                        disabled={actingOnId === m.id}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {actingOnId === m.id ? "Applying..." : "Confirm & Apply"}
                      </button>
                      <button
                        onClick={() => dismissAction(m)}
                        disabled={actingOnId === m.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {m.action_status === "applied" && (
                    <p className="mt-2 text-xs font-semibold text-emerald-600">✓ Applied</p>
                  )}
                  {m.action_status === "dismissed" && (
                    <p className="mt-2 text-xs font-medium text-slate-400">Dismissed</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask the assistant about this campaign..."
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
  );
}
