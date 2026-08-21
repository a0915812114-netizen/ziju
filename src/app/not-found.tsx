import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="text-sm text-[var(--muted)]">找不到這一頁</p>
      <h1 className="mt-2 text-3xl font-semibold">出了點問題</h1>
      <p className="mt-3 text-[var(--muted)]">網址可能打錯了，或這頁已經不在。請回工作室再試一次。</p>
      <Link href="/studio" className="btn primary mt-8 w-fit px-5 py-2">
        回工作室
      </Link>
    </div>
  );
}
