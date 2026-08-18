"use server";

export type LeadFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function submitLead(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const message = formData.get("message")?.toString().trim() ?? "";

  if (!name || !email || !phone) {
    return { status: "error", message: "Please fill in your name, email, and phone number." };
  }

  const lead = {
    name,
    email,
    phone,
    message,
    gclid: formData.get("gclid")?.toString() ?? "",
    utm_source: formData.get("utm_source")?.toString() ?? "",
    utm_medium: formData.get("utm_medium")?.toString() ?? "",
    utm_campaign: formData.get("utm_campaign")?.toString() ?? "",
    utm_term: formData.get("utm_term")?.toString() ?? "",
    utm_content: formData.get("utm_content")?.toString() ?? "",
    submittedAt: new Date().toISOString(),
  };

  // TODO: wire this up to the real CRM (GoHighLevel/HubSpot) instead of logging.
  console.log("New lead:", lead);

  return { status: "success", message: "Thanks! We'll be in touch within one business day." };
}
