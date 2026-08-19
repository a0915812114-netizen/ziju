import Link from "next/link";

export default function ClipsPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">我的剪輯與字幕</h1>
      <p className="mt-3 text-[var(--muted)]">
        這頁對應 What'Sub 的剪輯庫。字句還沒做雲端剪輯，先回專案列表改字幕。
      </p>
      <Link href="/studio" className="btn primary mt-8 w-fit">
        回到我的專案
      </Link>
    </div>
  );
}
