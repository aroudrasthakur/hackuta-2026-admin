import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdfjs/pdf.worker.min.mjs`;

// Serve PDF.js support assets locally, including fonts used by some resumes.
const options = {
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
};

export default function ResumePdf({ url, onClose }: { url: string; onClose: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<"unavailable" | "render" | null>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, entry.contentRect.width - 32));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function changePage(next: number) {
    setPage(next);
    viewport.current?.scrollTo({ top: 0, left: 0 });
  }

  const buttonClass = "rounded-md border border-sand bg-white px-3 py-2 text-sm hover:bg-clay disabled:cursor-not-allowed disabled:bg-clay disabled:text-ocean/70";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand bg-light px-4 py-3" aria-label="PDF controls">
        <div className="flex items-center gap-3">
          <button type="button" className={buttonClass} disabled={!pages || page <= 1 || failure !== null} onClick={() => changePage(page - 1)}>Previous</button>
          <span role="status" className="text-sm tabular-nums">{pages ? `Page ${page} of ${pages}` : "PDF"}</span>
          <button type="button" className={buttonClass} disabled={!pages || page >= pages || failure !== null} onClick={() => changePage(page + 1)}>Next</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Zoom out" title="Zoom out" className={`${buttonClass} min-w-10 font-semibold`} disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
          <button type="button" className={buttonClass} onClick={() => setZoom(1)}>Fit width</button>
          <span className="text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" title="Zoom in" className={`${buttonClass} min-w-10 font-semibold`} disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>+</button>
          <button type="button" autoFocus className={`${buttonClass} ml-1 font-semibold`} onClick={onClose}>Close</button>
        </div>
      </div>
      <div ref={viewport} className="min-h-0 flex-1 overflow-auto bg-sand/40 p-4" tabIndex={0} aria-label="Resume pages">
        {failure !== null ? (
          <div role="alert" className="mx-auto max-w-md rounded-lg border border-sand bg-white p-6 text-center">
            <h3 className="font-semibold">{failure === "unavailable" ? "Resume file unavailable" : "Unable to open this PDF"}</h3>
            <p className="mt-2 text-sm text-ocean">
              {failure === "unavailable"
                ? "We could not fetch the uploaded resume. It may have been removed or blocked. Try again, or close the preview and reopen the application."
                : "The file could not be parsed or displayed. It may be corrupted, password-protected, or unsupported in this browser. Try again or reload the page."}
            </p>
            <button type="button" className={`${buttonClass} mt-4`} onClick={() => { setFailure(null); setPages(0); setPage(1); setAttempt((value) => value + 1); }}>Try again</button>
          </div>
        ) : (
          <Document key={attempt} file={url} options={options} loading={<p role="status">Loading resume…</p>} onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setFailure("render")} onSourceError={() => setFailure("unavailable")} onPassword={() => setFailure("render")}>
            {width > 0 && <Page key={page} pageNumber={page} width={Math.min(width, 1000) * zoom} renderAnnotationLayer={false} loading={<p role="status">Loading page…</p>} onLoadError={() => setFailure("render")} onRenderError={() => setFailure("render")} />}
          </Document>
        )}
      </div>
    </div>
  );
}
