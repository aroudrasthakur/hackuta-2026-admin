import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

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
  const [failed, setFailed] = useState(false);

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
          <button type="button" className={buttonClass} disabled={!pages || page <= 1 || failed} onClick={() => changePage(page - 1)}>Previous</button>
          <span role="status" className="text-sm tabular-nums">{pages ? `Page ${page} of ${pages}` : "PDF"}</span>
          <button type="button" className={buttonClass} disabled={!pages || page >= pages || failed} onClick={() => changePage(page + 1)}>Next</button>
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
        {failed ? (
          <div role="alert" className="mx-auto max-w-md rounded-lg border border-sand bg-white p-6 text-center">
            <h3 className="font-semibold">Unable to load this resume</h3>
            <p className="mt-2 text-sm text-ocean">The file may be unavailable or could not be read. Try again, or close the preview and reopen the application. If it still fails, reload the page.</p>
            <button type="button" className={`${buttonClass} mt-4`} onClick={() => { setFailed(false); setPages(0); setPage(1); setAttempt((value) => value + 1); }}>Try again</button>
          </div>
        ) : (
          <Document key={attempt} file={url} options={options} loading={<p role="status">Loading resume…</p>} onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setFailed(true)} onSourceError={() => setFailed(true)} onPassword={() => setFailed(true)}>
            {width > 0 && <Page key={page} pageNumber={page} width={Math.min(width, 1000) * zoom} renderAnnotationLayer={false} loading={<p role="status">Loading page…</p>} onLoadError={() => setFailed(true)} onRenderError={() => setFailed(true)} />}
          </Document>
        )}
      </div>
    </div>
  );
}
