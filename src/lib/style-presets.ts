import { defaultStyle, type Orientation, type StyleAnimation, type SubtitleStyle } from "./style";

export type { StyleAnimation };

export type StylePreset = {
  id: string;
  name: string;
  author: string;
  orientation: Orientation;
  style: SubtitleStyle;
};

export function withMotion(
  style: SubtitleStyle,
  animation: StyleAnimation,
  bilingual = false,
): SubtitleStyle {
  return { ...style, animation, bilingual };
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "youtube-white",
    name: "YouTube 白字黑邊",
    author: "字句",
    orientation: "horizontal",
    style: withMotion(defaultStyle("horizontal"), "none"),
  },
  {
    id: "reels-yellow",
    name: "Reels 黃字",
    author: "字句",
    orientation: "vertical",
    style: withMotion(
      {
        ...defaultStyle("vertical"),
        color: "#ffe14a",
        strokeColor: "#111111",
        fontSize: 5.6,
      },
      "pop",
    ),
  },
  {
    id: "shorts-green",
    name: "Shorts 綠卡拉",
    author: "字句",
    orientation: "vertical",
    style: withMotion(
      {
        ...defaultStyle("vertical"),
        color: "#b8ff3c",
        strokeColor: "#102226",
        karaoke: true,
      },
      "fade",
    ),
  },
  {
    id: "tiktok-pink",
    name: "直式粉字",
    author: "字句",
    orientation: "vertical",
    style: withMotion(
      {
        ...defaultStyle("vertical"),
        color: "#ff8ad4",
        strokeColor: "#3b0830",
      },
      "zoom",
    ),
  },
  {
    id: "cinema-serif",
    name: "電影明體",
    author: "字句",
    orientation: "horizontal",
    style: withMotion(
      {
        ...defaultStyle("horizontal"),
        fontFamily: 'var(--font-noto-serif), "Noto Serif TC", serif',
        fontSize: 4.1,
        color: "#f8f1de",
        strokeColor: "#1a140c",
        karaoke: false,
      },
      "fade",
    ),
  },
  {
    id: "news-blue",
    name: "新聞藍",
    author: "字句",
    orientation: "horizontal",
    style: withMotion(
      {
        ...defaultStyle("horizontal"),
        color: "#d7ecff",
        strokeColor: "#12304a",
        karaoke: false,
      },
      "none",
    ),
  },
  {
    id: "kids-orange",
    name: "親子橘",
    author: "字句",
    orientation: "vertical",
    style: withMotion(
      {
        ...defaultStyle("vertical"),
        color: "#ffb347",
        strokeColor: "#4a2208",
        fontSize: 5.8,
      },
      "pop",
    ),
  },
  {
    id: "minimal-white",
    name: "極簡白",
    author: "字句",
    orientation: "horizontal",
    style: withMotion(
      {
        ...defaultStyle("horizontal"),
        strokeWidth: 0.08,
        karaoke: false,
        animation: "fade",
      },
      "fade",
    ),
  },
  {
    id: "heavy-stroke",
    name: "粗描邊",
    author: "字句",
    orientation: "horizontal",
    style: withMotion(
      {
        ...defaultStyle("horizontal"),
        strokeWidth: 0.32,
        strokeColor: "#000000",
        fontSize: 4.8,
      },
      "none",
    ),
  },
  {
    id: "bilingual-en",
    name: "雙語（上中下英）",
    author: "字句",
    orientation: "horizontal",
    style: withMotion({ ...defaultStyle("horizontal"), bilingual: true }, "fade", true),
  },
  {
    id: "ig-center",
    name: "IG 置中",
    author: "字句",
    orientation: "vertical",
    style: withMotion(
      {
        ...defaultStyle("vertical"),
        y: 52,
        fontSize: 4.8,
        karaoke: false,
      },
      "zoom",
    ),
  },
  {
    id: "karaoke-pop",
    name: "卡拉 OK 彈入",
    author: "字句",
    orientation: "horizontal",
    style: withMotion({ ...defaultStyle("horizontal"), karaoke: true }, "pop"),
  },
];
