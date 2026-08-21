# 字句

對齊 What'Sub 思路的字幕網站。影片留在本機，只上傳聲音做繁體中文聽打，再在瀏覽器裡校對、匯出。

## 第一階段（已做）

- 上傳影片或音檔，瀏覽器抽音
- Groq / OpenAI 聽打，台灣用詞校正
- 雙擊改字、Enter 斷句、行首 Backspace 合併、Alt 點字切斷
- 搜尋取代、個人詞庫
- 匯出 SRT、逐字稿
- 沒有 API 金鑰也可載入示範稿練編輯器

## 第二階段（已做）

- 波形、滾輪縮放、總覽條
- 暫停時滑鼠在波形上移動可預覽畫面
- 拖字幕塊、拉左右緣、磁吸對齊點／切點／相鄰字幕
- 拖空白處新增字幕、Delete 刪除、B 切斷、雙擊或 M 加對齊點
- 切點偵測（藍點）

## 第三階段（已做）

- 預覽疊字、拖到安全區、右下角改字級
- 橫式／直式安全框（對齊 What'Sub 實際邊距）
- 字型、字色、描邊、逐字高亮
- 空白鍵播放／暫停

## 第四階段（已做）

- 匯出選單：SRT、VTT、逐字稿
- 瀏覽器燒字幕成成品影片（畫布疊字 + MediaRecorder，預覽長怎樣就燒成那樣）
- 黑底字幕 WebM，給剪輯軟體去背
- 1x 燒錄與進度條；建議用 Chrome／Edge

## 之後依序

登入與額度、雲端專案

## 啟動

```bash
cd ziju
npm install
copy .env.example .env.local
```

在 `.env.local` 填入 `GROQ_API_KEY` 或 `OPENAI_API_KEY`，然後：

```bash
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)。

## 上架

公開站建議放 Vercel。聽打金鑰用環境變數，不要寫進程式。

- `GROQ_API_KEY` 或 `OPENAI_API_KEY`：公開聽打每天每 IP 5 次；對稿／翻譯每天 20 次
- `OWNER_TOKEN`：打開 `/go/你的token` 進入主人模式，聽打不限次數
- `QUOTA_SECRET`：可選，簽額度 cookie

```bash
npx vercel --prod --scope wen-sung
```

## 資安（上線前自己勾）

程式擋得了上傳與額度，擋不了帳號被拿走。

1. GitHub、Vercel、Groq 開兩步驟驗證
2. Groq／Vercel 設預算上限與警報
3. GitHub repo → Settings → Code security → 打開 Secret scanning、Push protection、Dependabot
4. 金鑰只要進過 git 或聊天，到 Groq 作廢舊鑰、換新鑰、改 Vercel 環境變數
5. 主人連結不要貼公開處

