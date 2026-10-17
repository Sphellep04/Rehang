"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { hashDistance, DUPLICATE_DISTANCE } from "@/lib/photo-tools";
import { preparePhoto, type PhotoEntry, type PhotoKind } from "@/lib/photo-client";

const slots: { kind: PhotoKind; label: string; hint: string; multiple?: boolean }[] = [
  { kind: "front", label: "Front", hint: "Required" },
  { kind: "back", label: "Back", hint: "Required" },
  { kind: "label", label: "Care label", hint: "Required" },
  { kind: "flaw", label: "Flaws", hint: "Required for Good and Fair" },
  { kind: "tags", label: "Tags", hint: "Required for New with tags" },
  { kind: "other", label: "Other details", hint: "Optional · up to 3", multiple: true },
];
const required: PhotoKind[] = ["front", "back", "label"];
const labelOf = (kind: PhotoKind) => slots.find((slot) => slot.kind === kind)?.label ?? kind;

export function PhotoPicker({ entries, setEntries }: { entries: PhotoEntry[]; setEntries: Dispatch<SetStateAction<PhotoEntry[]>> }) {
  const [busy, setBusy] = useState<PhotoKind[]>([]);
  const [errors, setErrors] = useState<Partial<Record<PhotoKind, string>>>({});
  const liveUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = liveUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  async function choose(kind: PhotoKind, files: FileList | null, multiple: boolean) {
    if (!files?.length) return;
    const room = multiple ? Math.max(0, 3 - entries.filter((entry) => entry.kind === kind).length) : 1;
    const picked = Array.from(files).slice(0, room || 1);
    setBusy((current) => [...current, kind]);
    setErrors((current) => ({ ...current, [kind]: undefined }));
    const made: PhotoEntry[] = [];
    for (const file of picked) {
      try {
        const entry = await preparePhoto(file, kind);
        liveUrls.current.add(entry.previewUrl);
        made.push(entry);
      } catch (error) {
        setErrors((current) => ({ ...current, [kind]: error instanceof Error ? error.message : "That photo could not be used." }));
      }
    }
    setBusy((current) => current.filter((value, index) => index !== current.indexOf(kind)));
    if (!made.length) return;
    setEntries((current) => {
      const kept = multiple ? current : current.filter((entry) => entry.kind !== kind);
      return [...kept, ...made].slice(0, 8);
    });
  }

  function remove(id: string) {
    setEntries((current) => current.filter((entry) => {
      if (entry.id === id) {
        URL.revokeObjectURL(entry.previewUrl);
        liveUrls.current.delete(entry.previewUrl);
        return false;
      }
      return true;
    }));
  }

  const matches: string[] = [];
  entries.forEach((a, i) => entries.slice(i + 1).forEach((b) => {
    if (a.phash && b.phash && hashDistance(a.phash, b.phash) <= DUPLICATE_DISTANCE) matches.push(`${labelOf(a.kind)} and ${labelOf(b.kind)}`);
  }));

  return (
    <div>
      <div className="photo-slots">
        {slots.map((slot) => {
          const mine = entries.filter((entry) => entry.kind === slot.kind);
          const full = slot.multiple ? mine.length >= 3 : false;
          const working = busy.includes(slot.kind);
          return (
            <div className="photo-slot-wrap" key={slot.kind}>
              <label className="photo-slot" htmlFor={`photo-${slot.kind}`} data-filled={mine.length > 0}>
                <span className="photo-slot-title">{slot.label}{required.includes(slot.kind) && <b>Required</b>}</span>
                {mine.length === 0 && <span className="photo-slot-mark">{working ? "…" : "+"}</span>}
                <small>{working ? "Preparing…" : mine.length ? (slot.multiple ? `${mine.length} of 3` : "Tap to replace") : slot.hint}</small>
                {!full && <input id={`photo-${slot.kind}`} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple={slot.multiple} disabled={working}
                  onChange={(event) => { void choose(slot.kind, event.target.files, slot.multiple ?? false); event.target.value = ""; }} />}
              </label>
              {mine.length > 0 && (
                <ul className="photo-previews">
                  {mine.map((entry) => (
                    <li key={entry.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.previewUrl} alt={`${slot.label} photo`} width={72} height={72} />
                      <button type="button" className="photo-remove" aria-label={`Remove ${slot.label} photo`} onClick={() => remove(entry.id)}>×</button>
                      {entry.blurry && <span className="photo-warning">Looks blurry</span>}
                    </li>
                  ))}
                </ul>
              )}
              {errors[slot.kind] && <p className="inline-error" role="alert">{errors[slot.kind]}</p>}
            </div>
          );
        })}
      </div>
      {entries.some((entry) => entry.blurry) && <p className="trade-hint">Some photos look blurry. Sharp, well lit photos sell faster. You can still publish, or tap a photo&apos;s slot to retake it.</p>}
      {matches.length > 0 && <p className="trade-hint">{matches.join(", ")} look almost the same. Show a different angle so buyers see more of the item.</p>}
      <p className="trade-hint">The Front photo is the cover. Photos appear in the order shown above.</p>
    </div>
  );
}
