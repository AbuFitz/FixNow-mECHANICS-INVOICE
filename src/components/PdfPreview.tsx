import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PdfModel } from "@/pdf/model";

/**
 * Renders the REAL PDF (same engine as the download) to canvases, so what the
 * admin sees is exactly what the customer receives — on phones too, where
 * browsers can't show PDFs in an iframe.
 */
export function PdfPreview({ model, onBlob, delay = 450 }: { model: PdfModel; onBlob?: (b: Blob) => void; delay?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const gen = useRef(0);
  const key = JSON.stringify(model);

  useEffect(() => {
    const my = ++gen.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const [{ renderPdfBlob }, pdfjs, worker] = await Promise.all([
          import("@/pdf/render"),
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const blob = await renderPdfBlob(model);
        if (my !== gen.current) return;
        onBlob?.(blob);
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (my !== gen.current || !host.current) return;
        const width = host.current.clientWidth || 600;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * dpr;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = "100%";
          canvas.style.display = "block";
          canvas.className = "mb-3 rounded-sm bg-white shadow-lift";
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
          frag.appendChild(canvas);
        }
        if (my !== gen.current || !host.current) return;
        host.current.replaceChildren(frag);
        setPages(doc.numPages);
        setError(null);
      } catch (e) {
        if (my === gen.current) setError(e instanceof Error ? e.message : "Couldn't render the preview.");
      } finally {
        if (my === gen.current) setBusy(false);
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="relative">
      {busy ? (
        <div className="sticky top-2 z-10 mb-2 flex w-fit items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground shadow-card">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating preview
        </div>
      ) : pages > 0 ? (
        <p className="eyebrow mb-2 text-muted-foreground">{pages} page{pages === 1 ? "" : "s"} · A4</p>
      ) : null}
      {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <div ref={host} aria-label="PDF preview" />
    </div>
  );
}
