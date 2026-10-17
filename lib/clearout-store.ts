import type { PhotoKind, PhotoSize } from "./photo-client";

/** Browser-only. Drafts for clear-out mode are kept in IndexedDB on this phone until they are uploaded. */

export type DraftFields = {
  title: string;
  description: string;
  brand_text: string;
  condition: string;
  price: number;
  category_id: number;
  size_id: number;
  town_id: number;
  colours: string[];
};

export type StoredPhoto = {
  id: string;
  kind: PhotoKind;
  width: number;
  height: number;
  phash: string | null;
  blurry: boolean;
  blobs: Record<PhotoSize, Blob>;
};

export type ClearOutDraft = {
  id: string;
  savedAt: number;
  fields: DraftFields;
  photos: StoredPhoto[];
  /** Set once the item row exists on the server, so a retry carries on instead of making a second one. */
  remoteItemId?: string;
  /** Set once the photos are attached on the server. */
  photosSet?: boolean;
  error?: string;
};

const DB_NAME = "rehang-clearout";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot keep drafts on the phone."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open phone storage."));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("Phone storage failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Phone storage is full or blocked."));
    });
  } finally {
    db.close();
  }
}

export async function listDrafts(): Promise<ClearOutDraft[]> {
  const all = await run<ClearOutDraft[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.savedAt - b.savedAt);
}

export const saveDraft = (draft: ClearOutDraft) => run("readwrite", (store) => store.put(draft)).then(() => undefined);
export const deleteDraft = (id: string) => run("readwrite", (store) => store.delete(id)).then(() => undefined);
