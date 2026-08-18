declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const CONVERSION_LABEL = process.env.NEXT_PUBLIC_GADS_CONVERSION_LABEL;

export function trackConversion(label?: string) {
  const sendTo = label || CONVERSION_LABEL;
  if (!sendTo || typeof window === "undefined" || !window.gtag) return;

  window.gtag("event", "conversion", {
    send_to: sendTo,
  });
}
