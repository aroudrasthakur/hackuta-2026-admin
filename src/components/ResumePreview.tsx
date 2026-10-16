import { lazy, Suspense, useId, useRef, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ApplicationDetail } from "../convex/adminApi";

const ResumePdf = lazy(() => import("./ResumePdf"));

export function ResumePreview({ resume }: { resume: ApplicationDetail["resume"] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <section aria-label="Resume" className="rounded-lg border border-sand bg-white/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg text-night">Resume</h3>
          {resume.status === "available" && <p className="mt-1 break-all text-sm text-ocean">{resume.filename || "Applicant resume"} · PDF</p>}
        </div>
        {resume.status === "available" && resume.url ? (
          <button ref={trigger} type="button" aria-haspopup="dialog" className="rounded-lg bg-night px-4 py-2 text-sm font-semibold text-white hover:bg-ocean focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean" onClick={() => {
            setOpen(true);
            dialog.current?.showModal();
          }}>Preview Resume</button>
        ) : <p className="text-sm text-ocean">{resume.status === "missing" ? "The attached resume is no longer available." : "No resume was attached."}</p>}
      </div>
      <dialog ref={dialog} aria-labelledby={titleId} className="resume-dialog" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
        <header className="flex items-start justify-between gap-4 border-b border-sand bg-light px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl text-night">Resume preview</h2>
            <p className="mt-1 break-all text-sm text-ocean">{resume.filename || "Applicant resume"}</p>
          </div>
          <button type="button" autoFocus onClick={close} className="rounded-lg border border-sand px-3 py-2 text-sm font-semibold hover:bg-clay">Close</button>
        </header>
        {open && resume.url && (
          <ErrorBoundary fallback={<p role="alert" className="p-6">Unable to open the preview. Reload the page and try again.</p>}>
          <Suspense fallback={<p role="status" className="p-6">Loading preview…</p>}>
            <ResumePdf key={resume.url} url={resume.url} />
          </Suspense>
          </ErrorBoundary>
        )}
      </dialog>
    </section>
  );
}
