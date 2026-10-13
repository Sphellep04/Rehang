"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";
import { uploadEntries, type PhotoEntry } from "@/lib/photo-client";
import { PhotoPicker } from "../_components/photo-picker";

type CategoryOption = { id: number; name: string };
type SizeOption = { id: number; system: string; value: string };
type TownOption = { id: number; name: string };

const conditions = [
  ["new_with_tags", "New with tags"],
  ["new_without_tags", "New without tags"],
  ["very_good", "Very good"],
  ["good", "Good"],
  ["fair", "Fair"],
] as const;

const colorChoices = ["Black", "White", "Grey", "Beige", "Brown", "Red", "Pink", "Orange", "Yellow", "Green", "Blue", "Navy", "Purple", "Gold", "Silver", "Multi", "Print/pattern"];
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
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const draftId = useRef<string | null>(null);
  const [progress, setProgress] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [needsId, setNeedsId] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    const requiredKinds = ["front", "back", "label"];

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

      let itemId = draftId.current;
      if (!itemId) {
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
        itemId = item.id as string;
        // If anything below fails, trying again continues with this same draft instead of making a second one.
        draftId.current = itemId;
      }

      const { rows, uploaded } = await uploadEntries(supabase, user.id, itemId, photos, (done, total) => setProgress(total ? `Uploading photo ${Math.min(done + 1, total)} of ${total}…` : ""));
      setProgress("Saving…");
      const { error: photoError } = await supabase.rpc("set_item_photos", { p_item: itemId, p_photos: rows });
      if (photoError) {
        if (uploaded.length) await supabase.storage.from("item-photos").remove(uploaded);
        throw new Error(`Your draft is saved but its photos were not. ${tradeError(photoError.message)}`);
      }

      const { data: published, error: publishError } = await supabase.rpc("publish_item", { p_item: itemId });
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
      draftId.current = null;
      setSelectedColors([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this draft. Try again.");
    } finally {
      setIsSaving(false);
      setProgress("");
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
        <PhotoPicker entries={photos} setEntries={setPhotos} />
      </section>

      <p className="listing-save-note" role="status" aria-live="polite">{message}{needsId && <> <Link href="/verify">Verify my ID</Link></>}</p>
      <div className="listing-submit-row"><p>{verificationLevel === "level2" ? "You are verified, so your listing goes live straight away." : "Only ID-verified sellers go live straight away. Yours will be published automatically once your ID is approved."}</p><button className="button button-ink" type="submit" disabled={isSaving}>{isSaving ? (progress || "Publishing…") : "Publish listing"}</button></div>
    </form>
  );
}
