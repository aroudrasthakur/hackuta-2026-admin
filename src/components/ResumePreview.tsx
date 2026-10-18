import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ApplicationDetail } from "../convex/adminApi";
import { isUnsupportedNonPdfResume } from "../lib/resumeFile";

const ResumePdf = lazy(() => import("./ResumePdf"));

export function ResumePreview({ resume }: { resume: ApplicationDetail["resume"] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  const unsupported = resume.status === "available" && isUnsupportedNonPdfResume(resume.filename, resume.url);

  useEffect(() => {
    if (!open) return;
    const dialogEl = dialog.current;
    if (!dialogEl) return;
    let cancelled = false;
    const focusInsideDialog = () => {
      if (cancelled) return;
      const focusTarget = dialogEl.querySelector<HTMLElement>("[autofocus], button:not([disabled])");
      focusTarget?.focus({ preventScroll: true });
    };
    focusInsideDialog();
    const observer = new MutationObserver(focusInsideDialog);
    observer.observe(dialogEl, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [open]);

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
          {resume.status === "available" && <p className="mt-1 break-all text-sm text-ocean">{resume.filename || "Applicant resume"}{!unsupported && " · PDF"}</p>}
        </div>
        {resume.status === "available" && resume.url && !unsupported ? (
          <button ref={trigger} type="button" aria-haspopup="dialog" className="rounded-lg bg-night px-4 py-2 text-sm font-semibold text-white hover:bg-ocean focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean" onClick={() => {
            setOpen(true);
            dialog.current?.showModal();
          }}>Preview Resume</button>
        ) : <p className="text-sm text-ocean">{unsupported ? "Preview is only available for PDF resumes. This file format is not supported." : resume.status === "missing" ? "The attached resume is no longer available." : "No resume was attached."}</p>}
      </div>
      <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true" aria-label="Resume preview" className="resume-dialog" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
        <header className="border-b border-sand bg-light px-4 py-3">
          <h2 id={titleId} className="break-all text-base font-semibold text-night">{resume.filename || "Applicant resume"}</h2>
        </header>
        {open && resume.url && (
          <ErrorBoundary fallback={<div role="alert" className="p-6"><p>Unable to open the preview. Reload the page and try again.</p><button type="button" onClick={close} className="mt-4 rounded-lg border border-sand px-3 py-2">Close</button></div>}>
          <Suspense fallback={<div className="flex items-center justify-between gap-4 p-4"><p role="status">Loading preview…</p><button type="button" autoFocus onClick={close} className="rounded-lg border border-sand px-3 py-2">Close</button></div>}>
            <ResumePdf key={resume.url} url={resume.url} onClose={close} />
          </Suspense>
          </ErrorBoundary>
        )}
      </dialog>
    </section>
  );
}
