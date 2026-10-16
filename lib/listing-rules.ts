/** The checks every new listing must pass before it is saved. Shared by the single-item form and clear-out mode. */
export type ListingCheck = {
  title: string;
  description: string;
  price: number;
  colourCount: number;
  condition: string;
  photoKinds: string[];
};

export function listingProblem(input: ListingCheck): string | null {
  const { title, description, price, colourCount, condition, photoKinds } = input;
  if (title.length < 10 || title.length > 60) return "Title must be 10 to 60 characters.";
  if (description.length > 500) return "Description must be 500 characters or fewer.";
  if (!Number.isInteger(price) || price < 20 || price > 20000) return "Price must be a whole amount from N$20 to N$20,000.";
  if (colourCount < 1 || colourCount > 2) return "Choose one or two colours.";
  if (photoKinds.length < 3 || photoKinds.length > 8 || ["front", "back", "label"].some((kind) => !photoKinds.includes(kind))) {
    return "Add front, back and care-label photos. Listings need 3 to 8 photos.";
  }
  if ((condition === "good" || condition === "fair") && !photoKinds.includes("flaw")) return "Add a photo showing the item's wear or flaws.";
  if (condition === "new_with_tags" && !photoKinds.includes("tags")) return "Add a photo showing the original tags.";
  return null;
}
