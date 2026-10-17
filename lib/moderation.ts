/** Reasons a person can give when reporting a listing, person or message. Must match reports_reason_check in Supabase. */
export const reportReasons: { value: string; label: string }[] = [
  { value: "scam", label: "It looks like a scam" },
  { value: "fake_or_counterfeit", label: "Fake or counterfeit" },
  { value: "prohibited_item", label: "Not allowed on Rehang" },
  { value: "off_platform_payment", label: "Asking for money outside Rehang" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
];
