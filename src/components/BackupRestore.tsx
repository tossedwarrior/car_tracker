"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Settings: download everything as one file, or replace everything from one. */
export function BackupRestore() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function restore() {
    if (!file) return;
    const sure = window.confirm(
      `Replace everything here with ${file.name}? Cars, listings, history, photos and logos added since that backup will be lost.`,
    );
    if (!sure) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/backup", { method: "POST", body: file });
      const body = (await res.json().catch(() => ({}))) as { restored?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Restore failed (HTTP ${res.status}).`);
      setMessage({ ok: true, text: `Restored ${body.restored}.` });
      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup">
      <div>
        <a href="/api/backup" className="pill-button" download>
          Download a backup
        </a>
      </div>
      <div className="backup-restore">
        <label className="field">
          <span>Restore from a backup</span>
          <input
            ref={input}
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <small>Replaces everything here with the backup&apos;s contents.</small>
        </label>
        <button type="button" className="pill-button primary" onClick={restore} disabled={!file || busy}>
          {busy ? "Restoring…" : "Restore"}
        </button>
      </div>
      {message && (
        <p className={message.ok ? "small" : "error small"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
