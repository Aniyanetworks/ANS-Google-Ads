export default function HintIcon({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0 cursor-help text-slate-400 hover:text-slate-600"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Z"
          clipRule="evenodd"
        />
      </svg>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
