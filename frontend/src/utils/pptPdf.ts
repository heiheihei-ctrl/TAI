import { jsPDF } from "jspdf";
import { proxifyRemoteAssetUrl } from "@/utils/assetProxy";

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("图片加载失败，无法导出 PDF"));
  image.src = proxifyRemoteAssetUrl(url, { forceProxy: true }) || url;
});

export async function exportPptImagesToPdf(urls: string[], fileName = "PPT.pdf") {
  if (!urls.length) throw new Error("没有可导出的页面");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1600, 900], compress: true });
  for (const [index, url] of urls.entries()) {
    const image = await loadImage(url);
    if (index) pdf.addPage([1600, 900], "landscape");
    pdf.addImage(image, "JPEG", 0, 0, 1600, 900, undefined, "FAST");
  }
  pdf.save(fileName);
}