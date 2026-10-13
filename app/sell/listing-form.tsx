"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

type CategoryOption = { id: number; name: string };
type SizeOption = { id: number; system: string; value: string };
type TownOption = { id: number; name: string };
type PhotoKind = "front" | "back" | "label" | "flaw" | "tags" | "other";
type PhotoSelection = { file: File; kind: PhotoKind };
type EncodedPhoto = { blob: Blob; width: number; height: number; size: "thumb" | "card" | "full" };

const conditions = [
  ["new_with_tags", "New with tags"],
  ["new_without_tags", "New without tags"],
  ["very_good", "Very good"],
  ["good", "Good"],
  ["fair", "Fair"],
] as const;

const colorChoices = ["Black", "White", "Grey", "Beige", "Brown", "Red", "Pink", "Orange", "Yellow", "Green", "Blue", "Navy", "Purple", "Gold", "Silver", "Multi", "Print/pattern"];
const photoSlots: { kind: PhotoKind; label: string; hint: string; multiple?: boolean }[] = [
  { kind: "front", label: "Front", hint: "Required" },
  { kind: "back", label: "Back", hint: "Required" },
  { kind: "label", label: "Care label", hint: "Required" },
  { kind: "flaw", label: "Flaws", hint: "Required for Good and Fair" },
  { kind: "tags", label: "Tags", hint: "Required for New with tags" },
  { kind: "other", label: "Other details", hint: "Optional · up to 3", multiple: true },
];

async function encodeWebp(file: File, maxSide: number, size: EncodedPhoto["size"]): Promise<EncodedPhoto> {
  const bitmap = await createImageBitmap(file);
  if (Math.min(bitmap.width, bitmap.height) < 600) {
    bitmap.close();
    throw new Error(`${file.name}: use an image at least 600 pixels on its shortest side.`);
  }

  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the photo. Try another image.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error(`Could not prepare ${file.name} as WebP.`);
  return { blob, width, height, size };
}

export function ListingForm({
  categories,
  sizes,
  towns,
  defaultTownId,
  verificationLevel,
}: {
  categories: CategoryOption[];
  sizes: SizeOption[];
  towns: TownOption[];
  defaultTownId: number | null;
  verificationLevel: string;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoSelection[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [needsId, setNeedsId] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function selectPhotos(kind: PhotoKind, files: FileList | null, multiple: boolean) {
    if (!files) return;
    const chosen = Array.from(files).map((file) => ({ file, kind }));
    setPhotos((current) => {
      const retained = current.filter((photo) => photo.kind !== kind);
      const next = [...retained, ...(multiple ? chosen.slice(0, 3) : chosen.slice(0, 1))];
      return next.slice(0, 8);
    });
  }

  function toggleColor(color: string) {
    setSelectedColors((current) => {
      if (current.includes(color)) return current.filter((value) => value !== color);
      if (current.length >= 2) return current;
      return [...current, color];
    });
  }

  async function saveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage("");
    setNeedsId(false);
    const formData = new FormData(formElement);
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const brandText = String(formData.get("brand_text") ?? "").trim();
    const condition = String(formData.get("condition") ?? "");
    const price = Number(formData.get("price"));
    const requiredKinds: PhotoKind[] = ["front", "back", "label"];

    if (title.length < 10 || title.length > 60) return setMessage("Title must be 10 to 60 characters.");
    if (description.length > 500) return setMessage("Description must be 500 characters or fewer.");
    if (!Number.isInteger(price) || price < 20 || price > 20000) return setMessage("Price must be a whole amount from N$20 to N$20,000.");
    if (selectedColors.length < 1 || selectedColors.length > 2) return setMessage("Choose one or two colours.");
    if (photos.length < 3 || photos.length > 8 || requiredKinds.some((kind) => !photos.some((photo) => photo.kind === kind))) {
      return setMessage("Add front, back and care-label photos. Listings need 3 to 8 photos.");
    }
    if ((condition === "good" || condition === "fair") && !photos.some((photo) => photo.kind === "flaw")) {
      return setMessage("Add a photo showing the item's wear or flaws.");
    }
    if (condition === "new_with_tags" && !photos.some((photo) => photo.kind === "tags")) {
      return setMessage("Add a photo showing the original tags.");
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setMessage("Your sign-in expired. Sign in again to save this draft.");
        return;
      }

      const { data: item, error: itemError } = await supabase
        .from("items")
        .insert({
          title,
          description: description || null,
          category_id: Number(formData.get("category_id")),
          size_id: Number(formData.get("size_id")),
          condition,
          brand_text: brandText || null,
          colours: selectedColors,
          price_cents: price * 100,
          town_id: Number(formData.get("town_id")),
        })
        .select("id")
        .single();

      if (itemError || !item) {
        setMessage("Could not save this draft. Check the details and try again.");
        return;
      }

      const photoRows = [];
      for (const [index, photo] of photos.entries()) {
        const variants = await Promise.all([
          encodeWebp(photo.file, 320, "thumb"),
          encodeWebp(photo.file, 720, "card"),
          encodeWebp(photo.file, 1600, "full"),
        ]);
        const paths: Record<EncodedPhoto["size"], string> = { thumb: "", card: "", full: "" };

        for (const variant of variants) {
          const path = `${user.id}/${item.id}/${crypto.randomUUID()}-${variant.size}.webp`;
          const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, variant.blob, {
            contentType: "image/webp",
            upsert: false,
          });
          if (uploadError) throw new Error("A photo could not be uploaded. Your item is saved as a draft; try again after checking your connection.");
          paths[variant.size] = path;
        }

        photoRows.push({
          item_id: item.id,
          position: index + 1,
          kind: photo.kind,
          path_thumb: paths.thumb,
          path_card: paths.card,
          path_full: paths.full,
          width: variants[2].width,
          height: variants[2].height,
        });
      }

      const { error: photoError } = await supabase.from("item_photos").insert(photoRows);
      if (photoError) throw new Error("Your item draft was saved, but its photos were not attached. Please try saving again.");

      const { data: published, error: publishError } = await supabase.rpc("publish_item", { p_item: item.id });
      if (publishError) {
        setMessage(`Saved as a draft. ${tradeError(publishError.message)}`);
        return;
      }
      setMessage(published === "active"
        ? "Your listing is live."
        : "Saved. Your listing goes live as soon as your ID is verified. Verify your ID to speed this up.");
      setNeedsId(published !== "active");
      formElement.reset();
      setPhotos([]);
      setSelectedColors([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this draft. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="listing-form" onSubmit={saveListing}>
      <section className="listing-form-section">
        <div className="form-section-heading"><span>01</span><div><h2>Item details</h2><p>Describe the item as it is.</p></div></div>
        <div className="form-fields">
          <label className="field-span-two" htmlFor="listing-title">Title<input id="listing-title" name="title" minLength={10} maxLength={60} placeholder="Brand, item and detail" required /></label>
          <label htmlFor="listing-category">Category<select id="listing-category" name="category_id" required defaultValue=""><option value="" disabled>Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label htmlFor="listing-size">Size<select id="listing-size" name="size_id" required defaultValue=""><option value="" disabled>Choose a size</option>{sizes.map((size) => <option key={size.id} value={size.id}>{size.system.replaceAll("_", " ")} · {size.value}</option>)}</select></label>
          <label htmlFor="listing-condition">Condition<select id="listing-condition" name="condition" required defaultValue=""><option value="" disabled>Choose condition</option>{conditions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label htmlFor="listing-brand">Brand <span>(optional)</span><input id="listing-brand" name="brand_text" maxLength={60} placeholder="Brand or leave blank" /></label>
          <label className="field-span-two" htmlFor="listing-description">Description <span>(optional · 500 characters)</span><textarea id="listing-description" name="description" maxLength={500} placeholder="Fit, fabric, measurements or anything a buyer should know" /></label>
          <fieldset className="field-span-two color-field"><legend>Colour <span>(choose 1 or 2)</span></legend><div className="color-options">{colorChoices.map((color) => <label className="color-option" key={color}><input type="checkbox" checked={selectedColors.includes(color)} onChange={() => toggleColor(color)} /><span className="color-swatch" data-color={color.toLowerCase().replaceAll("/", "-")} />{color}</label>)}</div></fieldset>
          <label htmlFor="listing-price">Price in N$<input id="listing-price" name="price" type="number" min={20} max={20000} step={1} placeholder="250" required /></label>
          <label htmlFor="listing-town">Town<select id="listing-town" name="town_id" required defaultValue={defaultTownId?.toString() ?? ""}><option value="" disabled>Choose a town</option>{towns.map((town) => <option value={town.id} key={town.id}>{town.name}</option>)}</select></label>
        </div>
      </section>

      <section className="listing-form-section">
        <div className="form-section-heading"><span>02</span><div><h2>Photos</h2><p>Use clear photos of the actual item. Front, back and care label are required.</p></div></div>
        <div className="photo-slots">{photoSlots.map((slot) => {
          const selected = photos.filter((photo) => photo.kind === slot.kind);
          const isRequired = slot.kind === "front" || slot.kind === "back" || slot.kind === "label";
          return <label className="photo-slot" key={slot.kind} htmlFor={`photo-${slot.kind}`}><span className="photo-slot-mark">{selected.length ? "✓" : "+"}</span><span className="photo-slot-title">{slot.label}{isRequired && <b>Required</b>}</span><small>{selected.length ? selected.map((photo) => photo.file.name).join(", ") : slot.hint}</small><input id={`photo-${slot.kind}`} type="file" accept="image/jpeg,image/png,image/webp" multiple={slot.multiple} onChange={(event) => selectPhotos(slot.kind, event.target.files, slot.multiple ?? false)} /></label>;
        })}</div>
      </section>

      <p className="listing-save-note" role="status" aria-live="polite">{message}{needsId && <> <Link href="/verify">Verify my ID</Link></>}</p>
      <div className="listing-submit-row"><p>{verificationLevel === "level2" ? "You are verified, so your listing goes live straight away." : "Only ID-verified sellers go live straight away. Yours will be published automatically once your ID is approved."}</p><button className="button button-ink" type="submit" disabled={isSaving}>{isSaving ? "Publishing…" : "Publish listing"}</button></div>
    </form>
  );
}
