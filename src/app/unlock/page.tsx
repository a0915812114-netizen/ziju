import { UnlockForm } from "@/components/studio/UnlockForm";
import Link from "next/link";
import { Suspense } from "react";

export default function UnlockPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="text-sm tracking-[0.3em] text-[var(--accent)]">ZIJU</p>
      <h1 className="mt-3 text-3xl font-semibold">主人解鎖</h1>
      <p className="mt-3 text-[var(--muted)]">
        密語走表單送出，不會留在網址列。解鎖後聽打不限次數。
      </p>
      <Suspense>
        <UnlockForm />
      </Suspense>
      <Link href="/studio" className="mt-10 text-sm text-[var(--muted)] hover:text-[var(--text)]">
        回工作室
      </Link>
    </div>
  );
}
