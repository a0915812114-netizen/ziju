import { Converter } from "opencc-js";

const toTraditional = Converter({ from: "cn", to: "tw" });

const TAIWAN_TERMS: Array<[string, string]> = [
  ["視頻", "影片"],
  ["軟件", "軟體"],
  ["硬件", "硬體"],
  ["默認", "預設"],
  ["信息", "資訊"],
  ["互聯網", "網際網路"],
  ["網絡", "網路"],
  ["短信", "簡訊"],
  ["鼠標", "滑鼠"],
  ["打印", "列印"],
  ["文件夾", "資料夾"],
  ["程序", "程式"],
  ["算法", "演算法"],
  ["質量", "品質"],
  ["服務器", "伺服器"],
  ["人工智能", "人工智慧"],
  ["什麽", "什麼"],
  ["甚麼", "什麼"],
  ["甚么", "什麼"],
  ["哪裏", "哪裡"],
  ["那裏", "那裡"],
  ["其它", "其他"],
  ["賬號", "帳號"],
  ["登陸", "登入"],
  ["阿中", "阿公"],
  ["阿忠", "阿公"],
  ["阿妈", "阿嬤"],
  ["阿媽", "阿嬤"],
  ["阿摩", "阿嬤"],
  ["巴樂", "芭樂"],
  ["把樂", "芭樂"],
  ["爸樂", "芭樂"],
  ["拔刺", "芭樂"],
  ["拔剌", "芭樂"],
  ["布要", "不要"],
  ["因該", "應該"],
];

export function toTaiwanTraditional(text: string) {
  let next = toTraditional(text);
  for (const [from, to] of TAIWAN_TERMS) {
    next = next.split(from).join(to);
  }
  return next;
}
