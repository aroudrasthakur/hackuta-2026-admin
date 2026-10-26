import { useEffect, useRef, type ReactNode } from "react";

/** Native modal provides focus containment, Escape handling, and focus restoration. */
export function MealDialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby="meal-dialog-title" className="meal-dialog"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="space-y-5 p-5 sm:p-6">
      <h2 id="meal-dialog-title" className="admin-card__title">{title}</h2>
      {children}
    </div>
  </dialog>;
}
