# Listing standards

These define what a listing contains and what counts as a good listing. They drive the listing form, the search filters, the database enums and the moderation rules.

> Starting values. Adjust after the Phase 0 WhatsApp test, based on what buyers actually asked about.

## Required fields

| Field | Rule |
|---|---|
| Photos | 3 to 8. Front, back and care label are required. A flaw photo is required when condition is "Good" or "Fair" |
| Title | 10–60 characters. Pattern: brand + item + key detail, e.g. "Truworths black pencil skirt" |
| Category | One leaf category from the tree below |
| Size | Size system + size value (see below) |
| Condition | One of the 5 grades below |
| Colour | 1 or 2 from the colour list |
| Brand | Pick from suggestions, or type a custom brand, or choose "No brand / unknown" |
| Price | Whole N$ only, from N$20 to N$20,000 |
| Town | Defaults to the seller's town |
| Description | Optional, up to 500 characters. Measurements are encouraged |

Optional: measurements (chest, waist, length, inside leg in cm) and material.

## Condition grades

| Grade | Meaning | Photo requirement |
|---|---|---|
| **New with tags** | Never worn, original tags attached | Photo showing the tags. Earns the "Unworn, tags on" badge |
| **New without tags** | Never worn, tags removed | Standard photos |
| **Very good** | Worn a few times, no visible flaws | Standard photos |
| **Good** | Worn, with light signs of wear (fading, light pilling) | Photo of any wear |
| **Fair** | Clear flaws, described honestly (stain, small hole, missing button) | Photo of every flaw, and a description |

A dispute for "not as described" is judged against these definitions.

## Category tree (v1)

```text
Women
  Dresses · Tops & T-shirts · Shirts & blouses · Knitwear · Jackets & coats
  Jeans · Trousers · Skirts · Shorts · Suits & blazers · Activewear
  Swimwear (new/sealed only) · Sleepwear · Maternity
Men
  T-shirts · Shirts · Knitwear · Jackets & coats · Jeans · Trousers · Shorts
  Suits & blazers · Activewear
Kids
  Baby (0–24 months) · Girls · Boys · School uniform
Shoes
  Women · Men · Kids
Bags & accessories
  Handbags · Backpacks · Wallets · Belts · Hats & caps · Scarves · Jewellery · Sunglasses
Traditional & occasion wear
  Traditional and cultural dresses · Wedding & bridesmaid · Graduation · Formal & evening
Workwear
  Office wear · Uniforms & overalls
```

Why the local categories matter:
- **School uniform** supports the back-to-school campaign (January).
- **Traditional & occasion wear** covers traditional and cultural dresses, and graduation and wedding outfits, which are expensive to buy new and often worn only once.

## Size systems

Namibian closets hold labels from South African chains (Mr Price, Pep, Woolworths, Truworths, Edgars and others) plus imports, so sizes are mixed. Each listing stores the **size system** and the **size value**, plus a normalised **size group** for filtering.

| Size system | Values |
|---|---|
| Letter | XXS, XS, S, M, L, XL, XXL, 3XL, 4XL |
| Women numeric (UK/SA) | 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26 |
| Women numeric (EU) | 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54 |
| Waist (jeans, trousers) | 24–44 inches |
| Men collar (shirts) | 14–18 inches |
| Shoes (UK/SA) | 1–13, including half sizes |
| Shoes (EU) | 33–48 |
| Kids by age | 0–3m, 3–6m, 6–12m, 12–18m, 18–24m, 2–3y, 3–4y … 13–14y |
| One size | One size |

**Search filter:** buyers filter by *size group* (XS to 4XL for clothing, shoe size, or kids' age). A lookup table maps each system value to a group, e.g. UK 12 → M and EU 40 → M. Check the mapping against real labels during the WhatsApp test.

## Colours

Black, White, Grey, Beige, Brown, Red, Pink, Orange, Yellow, Green, Blue, Navy, Purple, Gold, Silver, Multi, Print/pattern.

## Photo rules

- Real photos of the actual item. No stock photos, no screenshots from shops or other sites, no watermarks.
- Good light, plain background if possible. A hanger or flat lay is fine.
- Required: **front, back, care label**. Also **flaws**, and **tags** for "New with tags".
- No faces needed. No other people in photos without their consent.
- No phone numbers, social handles or prices written on photos.

Automatic checks (built in milestone M2):

| Check | Action |
|---|---|
| Blurry image | Warn and ask to retake. Block if very blurry |
| Same photo used by another account | Hold the listing for moderator review |
| Phone number or social handle detected in the image text | Block the photo and explain why |
| Image too small (under 600 px on the short side) | Ask to retake |

## Badges on listings

| Badge | Rule |
|---|---|
| **Unworn, tags on** | Condition is "New with tags" and a tag photo is present |
| **Photos reviewed** | Item over N$1,500 with a claimed brand that a moderator has checked. Not a guarantee of authenticity |
| **Founding Seller** | Seller joined before public launch (shown on the seller, not the item) |
| **Trusted seller** | See [verification and limits](verification-and-limits.md) |

## Pricing guidance

- The MVP shows a simple hint beside the price box: "Similar items usually sell for N$X–Y", using category + brand + condition medians from sold items. Until there's enough data, show fixed ranges per category, collected from the WhatsApp test.
- Price suggestions based on similar sold items come fully in Phase 2.

## What gets a listing removed

See [prohibited items](../policies/prohibited-items.md) and [seller rules](../policies/seller-rules.md).
