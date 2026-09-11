export default function ThinkingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <rect x="9" y="2" width="2" height="4" fill="currentColor" />
          <circle cx="10" cy="2" r="1.5" fill="currentColor" />
          <rect x="1" y="11" width="2.5" height="4" rx="1.25" fill="currentColor" />
          <rect x="20.5" y="11" width="2.5" height="4" rx="1.25" fill="currentColor" />
          <rect x="4" y="7" width="16" height="13" rx="4" fill="currentColor" />
          <circle cx="9" cy="14" r="1.75" fill="#0f172a" />
          <circle cx="15" cy="14" r="1.75" fill="#0f172a" />
        </svg>
      </span>
      <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">
        Processing your request
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
        </span>
      </div>
    </div>
  );
}
