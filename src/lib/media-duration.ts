export function readDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const node = document.createElement("video");
    node.preload = "metadata";
    node.src = url;
    node.onloadedmetadata = () => {
      resolve(Math.round((node.duration || 0) * 1000));
      URL.revokeObjectURL(url);
    };
    node.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}
