# 字句資安註記

2026-08-22 攻擊者視角靜態審查。公開站 [ziju.vercel.app](https://ziju.vercel.app)。不寫利用步驟。

優先：

- **P0** 現在就該擋，會直接燒錢或被接管用量
- **P1** 下一批改碼，放大 P0 的傷害
- **P2** 有空再做，防禦加深
- **P3** 先不做，或已經擋下

狀態：待做／已做／不適用。

## P0　已做（2026-08-22）

| ID | 項目 | 做了什麼 |
| --- | --- | --- |
| P0-1 | 額度跨機器會歸零 | 有 Upstash Redis 時，次數寫進 Redis。本機沒接 Redis 仍用記憶體加 cookie |
| P0-2 | 主人連結等於無限方案 | 新解鎖頁 `/unlock`，密語 POST 不進網址。舊 `/go/密語` 改成自動送表單，並加 no-referrer |
| P0-3 | 額度內把每次用到滿 | 公開聽打每滿 10 分鐘再扣 1 次。40 分鐘最多扣 4 次 |

正式站要接 Redis，環境變數：`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`。沒接時 P0-1 在多台機器上仍可能被繞過。

## P1　待做

| ID | 項目 | 說明 |
| --- | --- | --- |
| P1-1 | 主人字串在網址 | 已加 Referrer-Policy。請改用 `/unlock`，不要再把密語放進書籤網址 |
| P1-2 | `/go/` 猜錯不封鎖 | 字串夠長時 practically 猜不中。加 IP 冷卻 |
| P1-3 | 額度簽名可回退成固定字串 | 正式環境金鑰全空時，原始碼裡的 `ziju-quota` 能簽假 cookie。設獨立 `QUOTA_SECRET`，拿掉硬編碼後備 |

## P2　待做

| ID | 項目 | 說明 |
| --- | --- | --- |
| P2-1 | 提示注入 | 字幕進模型可擾亂對稿／翻譯。套不出伺服器金鑰。system prompt 已當資料處理 |
| P2-2 | 沒有 CSP | 目前沒有把 HTML 當程式執行。FFmpeg 從 jsDelivr 載入 |
| P2-3 | GET `/api/transcribe` 偵察 | 能知道用 Groq、還剩幾次。可改少回 |
| P2-4 | 匯入惡意專案 JSON | 只害匯入者自己的瀏覽器 |
| P2-5 | GitHub／Vercel 兩步驟驗證 | 帳號被拿走程式擋不了。Groq 免費方案沒有月費上限可設，不必為了這個升企業版 |

## P3　已擋或不適用

| ID | 攻擊者會試 | 為什麼現在不行 |
| --- | --- | --- |
| P3-1 | 改網址偷別人的稿 | 稿在各自 localStorage，沒有雲端專案 |
| P3-2 | 上傳 exe 改副檔名 | API 只收真 WAV |
| P3-3 | SSRF | 對外只打寫死的 Groq／OpenAI |
| P3-4 | 前端挖金鑰 | 沒有 `NEXT_PUBLIC_` 金鑰 |
| P3-5 | 字幕 XSS | React 文字節點，沒有 `dangerouslySetInnerHTML` |
| P3-6 | 跨站偷主人 cookie | HttpOnly + SameSite=Lax |
| P3-7 | SQL 注入 | 沒有資料庫 |
| P3-8 | Groq 月費上限 | 沒綁卡；免費方案打滿就拒。之後綁卡當天再設 |

## 已做（前一輪）

- 上傳白名單、檔頭、800MB、亂數檔名
- 聽打時長改伺服器查 WAV
- 翻譯／對稿伺服器限流
- 錯誤不噴上游 JSON
- Groq 金鑰已輪替並寫進 Vercel
- GitHub Secret scanning、Push protection、Dependabot 已開

## 改碼順序（對齊優先）

1. ~~P0-1 額度改共用儲存~~ 已做（正式站需 Upstash）
2. ~~P0-2 + Referrer-Policy~~ 已做
3. P1-3 獨立 `QUOTA_SECRET`
4. P1-2 `/go/` IP 冷卻（解鎖 API 已有突發上限，可再加長）
5. 上雲專案之後才做授權互測（現在沒這層資料）
