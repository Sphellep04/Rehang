/** Choices shared by the single-item form and clear-out mode. */
export const conditions = [
  ["new_with_tags", "New with tags"],
  ["new_without_tags", "New without tags"],
  ["very_good", "Very good"],
  ["good", "Good"],
  ["fair", "Fair"],
] as const;

export const colorChoices = ["Black", "White", "Grey", "Beige", "Brown", "Red", "Pink", "Orange", "Yellow", "Green", "Blue", "Navy", "Purple", "Gold", "Silver", "Multi", "Print/pattern"];

export type CategoryOption = { id: number; name: string };
export type SizeOption = { id: number; system: string; value: string };
export type TownOption = { id: number; name: string };
