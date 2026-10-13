"use client";

import { useActionState } from "react";
import Link from "next/link";
import { completeProfile } from "./actions";

type ProfileFormProps = {
  handle: string;
  displayName: string;
  bio: string;
  townId: number | null;
  towns: { id: number; name: string }[];
};

export function ProfileForm({ handle, displayName, bio, townId, towns }: ProfileFormProps) {
  const [state, action, pending] = useActionState(completeProfile, undefined);

  return (
    <form className="profile-form" action={action}>
      <label htmlFor="display-name">Your name<input id="display-name" name="display_name" defaultValue={displayName === "New member" ? "" : displayName} autoComplete="name" minLength={2} maxLength={40} required /></label>
      <label htmlFor="handle">Shop handle<input id="handle" name="handle" defaultValue={handle.startsWith("user_") ? "" : handle} autoComplete="username" pattern="[a-z0-9_]{3,20}" minLength={3} maxLength={20} required /><small>rehang.com.na/{handle.startsWith("user_") ? "your-handle" : handle}</small></label>
      <label htmlFor="town">Town<select id="town" name="town_id" defaultValue={townId?.toString() ?? ""} required><option value="" disabled>Select your town</option>{towns.map((town) => <option value={town.id} key={town.id}>{town.name}</option>)}</select></label>
      <label htmlFor="bio">About you <span>(optional)</span><textarea id="bio" name="bio" defaultValue={bio} maxLength={160} placeholder="A little about your style…" /></label>
      <label className="terms-check"><input type="checkbox" name="accept_terms" required /><span>I have read and agree to Rehang’s <Link href="/terms">draft Terms of Use</Link> and <Link href="/privacy">draft Privacy Policy</Link>.</span></label>
      <p className="auth-message" role="alert">{state?.message}</p>
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Saving profile…" : "Create my profile"}</button>
    </form>
  );
}