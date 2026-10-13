import Image from "next/image";
import Link from "next/link";
import { formatPrice, type Listing } from "@/lib/listings";
import { SaveButton } from "./save-button";

type Props = { listing: Listing; saved: boolean; signedIn: boolean; showSeller?: boolean };

export function ListingCard({ listing, saved, signedIn, showSeller = true }: Props) {
  const href = `/item/${listing.id}`;
  const sold = listing.status === "sold";

  return (
    <article className="listing">
      <Link className="listing-image" href={href} aria-label={`View ${listing.title}`}>
        {listing.image && (
          <Image src={listing.image} alt={listing.title} width={720} height={870} sizes="(max-width: 760px) 50vw, 28vw" loading="lazy" unoptimized />
        )}
        <span className="condition-tag">{sold ? "Sold" : listing.condition}</span>
      </Link>
      {!sold && (
        <SaveButton itemId={listing.id} title={listing.title} initialSaved={saved} signedIn={signedIn} />
      )}
      <Link className="listing-info" href={href}>
        <span className="listing-title-row"><span>{listing.title}</span><b>{formatPrice(listing.price)}</b></span>
        <span className="listing-meta">Size {listing.size} <i /> {listing.category}</span>
        {showSeller && (
          <span className="seller-line">{listing.verified ? "Verified seller" : "Seller"}: {listing.seller}{listing.trusted ? " · Trusted" : ""}</span>
        )}
      </Link>
    </article>
  );
}
