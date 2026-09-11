import { useEffect, useRef, useState } from "react";
import HintIcon from "./HintIcon";

type Suggestion = {
  resourceName: string;
  name: string;
  canonicalName: string;
  countryCode: string;
  targetType: string;
};

export default function LocationAutocomplete({ name }: { name: string }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const webhookUrl = import.meta.env.VITE_N8N_GEO_TARGET_SUGGEST_WEBHOOK_URL;
    if (!webhookUrl || query.trim().length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      setSearched(false);
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Request failed (${res.status}): ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        // n8n's default webhook response returns a bare object (not an
        // array) when the workflow produced exactly one output item --
        // confirmed live: a single-match query ("ontario,canada") came back
        // as one object, not a 1-element array, and got silently treated as
        // zero results.
        const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
        setSuggestions(list);
        setSearched(true);
        setOpen(true);
      } catch (err) {
        setSuggestions([]);
        const message = err instanceof Error ? err.message : "network error";
        setFetchError(message);
        // eslint-disable-next-line no-console
        console.error("Location suggest failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function addSuggestion(s: Suggestion) {
    setSelected((prev) => (prev.some((p) => p.resourceName === s.resourceName) ? prev : [...prev, s]));
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function removeSuggestion(resourceName: string) {
    setSelected((prev) => prev.filter((p) => p.resourceName !== resourceName));
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        Targeted Locations
        <HintIcon text="Search for cities, regions, or countries — results come from Google Ads' own location database, so what you pick is guaranteed to resolve correctly when the campaign is built." />
      </label>

      <input type="hidden" name={name} value={selected.map((s) => s.canonicalName).join(",")} />

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.resourceName}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {s.canonicalName}
              <button
                type="button"
                onClick={() => removeSuggestion(s.resourceName)}
                className="text-slate-400 hover:text-red-600"
                aria-label={`Remove ${s.canonicalName}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => (suggestions.length > 0 || searched) && setOpen(true)}
        placeholder="e.g. Cambridge, Ontario"
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
      />

      {!loading && fetchError && query.trim().length >= 2 && (
        <p className="mt-1 text-xs text-red-600">Couldn't load suggestions: {fetchError}</p>
      )}

      {open && (loading || searched) && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-4 py-2 text-sm text-slate-400">Searching...</p>
          ) : suggestions.length === 0 ? (
            <p className="px-4 py-2 text-sm text-slate-400">No matching locations.</p>
          ) : (
            suggestions.map((s) => (
              <button
                key={s.resourceName}
                type="button"
                onClick={() => addSuggestion(s)}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
              >
                {s.canonicalName}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
