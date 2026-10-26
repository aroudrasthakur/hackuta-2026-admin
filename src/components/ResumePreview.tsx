import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ApplicationDetail } from "../convex/adminApi";
import { isUnsupportedNonPdfResume } from "../lib/resumeFile";
import { reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";

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
    <section aria-label="Resume" className="admin-card admin-card__body">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="admin-card__title">Resume</h3>
          {resume.status === "available" && <p className="admin-card__hint break-all">{resume.filename || "Applicant resume"}{!unsupported && " · PDF"}</p>}
        </div>
        {resume.status === "available" && resume.url && !unsupported ? (
          <button ref={trigger} type="button" aria-haspopup="dialog" className={reviewPrimaryButtonClass} onClick={() => {
            setOpen(true);
            dialog.current?.showModal();
          }}>Preview Resume</button>
        ) : <p className="text-sm text-ocean">{unsupported ? "Preview is only available for PDF resumes. This file format is not supported." : resume.status === "missing" ? "The attached resume is no longer available." : "No resume was attached."}</p>}
      </div>
      <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true" aria-label="Resume preview" className="resume-dialog" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
        <header className="border-b border-border bg-surface px-5 py-4">
          <h2 id={titleId} className="break-all text-base font-semibold text-night">{resume.filename || "Applicant resume"}</h2>
        </header>
        {open && resume.url && (
          <ErrorBoundary fallback={<div role="alert" className="p-6"><p>Unable to open the preview. Reload the page and try again.</p><button type="button" onClick={close} className={`mt-4 ${reviewSecondaryButtonClass}`}>Close</button></div>}>
          <Suspense fallback={<div className="flex items-center justify-between gap-4 p-4"><p role="status">Loading preview…</p><button type="button" autoFocus onClick={close} className={reviewSecondaryButtonClass}>Close</button></div>}>
            <ResumePdf key={resume.url} url={resume.url} onClose={close} />
          </Suspense>
          </ErrorBoundary>
        )}
      </dialog>
    </section>
  );
}
