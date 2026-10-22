"use client";

import { removeWatch } from "@/app/actions";

export function DeleteWatchButton({ id, title }: { id: number; title: string }) {
  return (
    <form
      action={removeWatch}
      onSubmit={(e) => {
        if (!confirm(`Remove ${title} and all its saved listings and history?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button danger">
        Remove from watchlist
      </button>
    </form>
  );
}
