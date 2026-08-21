"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function UnlockForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    search.get("fail") === "1" ? "解鎖失敗，請再試一次。" : "",
  );

  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "").trim();
    if (!fromHash) return;
    window.history.replaceState(null, "", "/unlock");
    void submit(fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value: string) {
    const next = value.trim();
    if (!next || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token: next }),
      });
      if (!response.ok) {
        setMessage(response.status === 429 ? "試太多次了，請稍後再試。" : "解鎖失敗，請再試一次。");
        setBusy(false);
        return;
      }
      router.replace("/studio");
    } catch {
      setMessage("出了點問題，請稍後再試。");
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-8 flex w-full max-w-md flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(token);
      }}
    >
      <label className="text-sm text-[var(--muted)]">
        主人密語
        <input
          type="password"
          autoComplete="off"
          className="field mt-2 w-full"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <button type="submit" className="btn primary w-fit px-5 py-2" disabled={busy}>
        {busy ? "解鎖中…" : "進入主人模式"}
      </button>
      {message ? <p className="text-sm text-[var(--accent)]">{message}</p> : null}
    </form>
  );
}
