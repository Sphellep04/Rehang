# Performance and low-data targets

Mobile data is expensive for many Namibians, so using little data is a feature, not a nice-to-have. These are hard targets. Measure them before every release.

## Targets

| Measure | Target |
|---|---|
| Home feed, first load (cold cache) | **Under 600 KB** transferred, including 12 thumbnails |
| Home feed, repeat visit | Under 150 KB (cached app shell) |
| Item page | Under 400 KB with the first full photo. Other photos load when swiped to |
| JavaScript on first load | Under 200 KB gzipped |
| Largest Contentful Paint on a mid-range Android phone over 3G | Under 3 seconds |
| Photo upload per image | At most 300 KB after compression in the browser |

## Images

Compress in the browser before upload (for example with `browser-image-compression` or a canvas step), then store three sizes as **WebP**:

| Variant | Longest side | Typical size | Used on |
|---|---|---|---|
| thumb | 320 px | 15–30 KB | Feed and grids |
| card | 640 px | 40–70 KB | Item page on phones |
| full | 1280 px | 120–200 KB | Zoom |

- Strip EXIF data, including GPS location, for privacy.
- Lazy-load everything below the fold. Use `srcset` so small screens never download the full size.
- Show a blurred placeholder or a solid colour while loading.

## Data saver mode

A toggle in settings, turned on automatically when the browser reports `navigator.connection.saveData`:
- Feed shows thumbnails only, with a lower-quality preview.
- Item page loads only the first photo until the user taps "Load photos".
- No autoplaying media anywhere, whether data saver is on or off.

## App shell and offline

- A PWA service worker caches the app shell, fonts, icons and category data.
- Closet clear-out mode saves drafts locally (IndexedDB) so a dropped connection doesn't lose work. Drafts upload when back online.
- Show clear offline states instead of spinners that never end.

## Other rules

- System fonts, or at most one web font subset.
- Infinite scroll in pages of 12–20 items.
- Postgres queries for the feed must use indexes (see the [data model](data-model.md)). Aim for under 100 ms.
- Check the budgets in CI with Lighthouse CI on the feed and item pages (see [testing and deployment](testing-and-deployment.md)).
