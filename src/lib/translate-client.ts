export async function translateLines(lines: string[], to: string) {
  const out: string[] = [];
  const size = 80;
  for (let i = 0; i < lines.length; i += size) {
    const slice = lines.slice(i, i + size);
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, lines: slice }),
    });
    const payload = (await response.json()) as { lines?: unknown; error?: string };
    if (!response.ok || !Array.isArray(payload.lines) || payload.lines.length !== slice.length) {
      throw new Error("翻譯失敗");
    }
    out.push(...payload.lines.map((line) => String(line ?? "").trim()));
  }
  return out;
}
