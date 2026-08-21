export const PUBLIC_FAIL = "出了點問題，請稍後再試。";

export function publicFailMessage(error: unknown) {
  if (error instanceof Error) {
    const text = error.message.trim();
    if (text && !looksInternal(text)) return text;
  }
  return PUBLIC_FAIL;
}

function looksInternal(text: string) {
  return (
    /https?:\/\//i.test(text) ||
    /[A-Z]:\\|\/src\/|\/app\/|node_modules|Traceback|at\s+\S+\s+\(/i.test(text) ||
    /prompt length|invalid_request|stack|ECONN|ENOENT|sql/i.test(text) ||
    text.length > 120
  );
}
