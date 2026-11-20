"use client";

import { removeWatch } from "@/app/actions";

export function DeleteWatchButton({ id, title }: { id: number; title: string }) {
  return (
    <form
      action={removeWatch}
      onSubmit={(e) => {
        if (!confirm(`Remove ${title} from your watchlist? Your target price, notes and alerts for it go too.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button danger">
        Remove from watchlist
      </button>
    </form>
  );
}
