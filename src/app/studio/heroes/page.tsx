import Link from "next/link";

export default function HeroesPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">英雄榜</h1>
      <p className="mt-3 text-[var(--muted)]">
        What'Sub 在這裡讓大家分享字幕樣式。字句還沒開放公開牆，樣式先存在各專案裡。
      </p>
      <Link href="/studio" className="btn primary mt-8 w-fit">
        回到我的專案
      </Link>
    </div>
  );
}
