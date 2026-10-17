"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitIdVerification } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ID_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const SELFIE_TYPES = ["image/jpeg", "image/png"];

function extension(file: File) {
  return file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
}

export function VerifyForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [legalName, setLegalName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!legalName.trim() || !idNumber.trim()) return setError("Enter your full name and ID number.");
    if (!idFile || !selfie) return setError("Please add both photos.");
    if (!ID_TYPES.includes(idFile.type)) return setError("Your ID must be a JPG, PNG or PDF.");
    if (!SELFIE_TYPES.includes(selfie.type)) return setError("Your selfie must be a JPG or PNG.");
    if (idFile.size > MAX_BYTES || selfie.size > MAX_BYTES) return setError("Each file must be under 10 MB.");

    setBusy(true);
    setError("");
    const supabase = createClient();
    const stamp = Date.now();
    const idPath = `${userId}/${stamp}-id.${extension(idFile)}`;
    const selfiePath = `${userId}/${stamp}-selfie.${extension(selfie)}`;

    const first = await supabase.storage.from("id-documents").upload(idPath, idFile, { contentType: idFile.type });
    const second = first.error ? null : await supabase.storage.from("id-documents").upload(selfiePath, selfie, { contentType: selfie.type });
    if (first.error || second?.error) {
      // Clean up whichever half made it, so nothing sensitive is left behind unreferenced.
      await supabase.storage.from("id-documents").remove([idPath, selfiePath]);
      setBusy(false);
      return setError("The upload failed. Check your connection and try again.");
    }

    const result = await submitIdVerification({ documentPath: idPath, selfiePath, legalName, idNumber });
    setBusy(false);
    if (!result.ok) {
      // Nothing was recorded, so remove the uploads rather than leave ID photos behind.
      await supabase.storage.from("id-documents").remove([idPath, selfiePath]);
      return setError(result.message);
    }
    router.refresh();
  }

  return (
    <form className="order-form verify-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="legal-name">Full name as it appears on your ID</label>
      <input id="legal-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} autoComplete="name" maxLength={100} required />
      <label htmlFor="id-number">ID or passport number</label>
      <input id="id-number" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} autoComplete="off" maxLength={24} required />
      <small className="auth-hint">We keep only a one-way scramble of this number. It stops one person opening several seller accounts.</small>
      <label htmlFor="id-file">Photo of your Namibian ID, driving licence or passport</label>
      <input id="id-file" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setIdFile(event.target.files?.[0] ?? null)} />
      <label htmlFor="selfie-file">A selfie of you holding the same ID</label>
      <input id="selfie-file" type="file" accept="image/jpeg,image/png" capture="user" onChange={(event) => setSelfie(event.target.files?.[0] ?? null)} />
      <p className="trade-hint">Only our moderators can see these. They are deleted 7 days after we review them.</p>
      <button className="button button-coral" type="submit" disabled={busy || !idFile || !selfie || !legalName.trim() || !idNumber.trim()}>{busy ? "Uploading…" : "Submit for review"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  );
}
