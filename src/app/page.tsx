import Link from "next/link";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ unlock?: string }>;
}) {
  const query = await searchParams;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm tracking-[0.3em] text-[var(--accent)]">ZIJU</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight">字句</h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-[var(--muted)]">
        聽打、斷句、翻譯雙語、對時間、燒字幕。影片留在你的電腦。編輯器是三區：波形、預覽安全框、字幕列表。
      </p>
      {query.unlock === "0" ? (
        <p className="mt-4 text-sm text-[var(--accent)]">解鎖失敗。請改走主人解鎖頁。</p>
      ) : null}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/studio"
          className="rounded-full bg-[var(--accent-2)] px-5 py-2.5 text-sm font-medium text-[#0a0a0a]"
        >
          打開工作室
        </Link>
        <a href="#steps" className="btn">
          現在做到哪
        </a>
      </div>
      <ol id="steps" className="mt-16 space-y-3 text-sm leading-7 text-[var(--muted)]">
        <li>公開網址：示範稿、對時間、燒字幕都能用。訪客聽打每天有次數上限。</li>
        <li>聽打金鑰放在伺服器，不進瀏覽器。影片最長 40 分鐘，本機抽音後分段聽打。語言可選 90 多種。</li>
        <li>
          你自己打開 <Link href="/unlock">主人解鎖</Link>，聽打不限次數。密語不要放在網址列。
        </li>
        <li className="text-[var(--text)]">
          雙語翻譯、樣式預設、動態字幕、英雄榜、專案檔匯出匯入已接上。登入額度還沒做。
        </li>
      </ol>
    </div>
  );
}
