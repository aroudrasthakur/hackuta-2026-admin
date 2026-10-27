import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";

/**
 * Modal form on the native `<dialog>`, which traps focus and closes on
 * Escape. Mount it only while open; unmounting closes it.
 */
export function ShopDialog({
  title,
  description,
  drawer = false,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  drawer?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    const cancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId} className={`shop-dialog${drawer ? " shop-dialog--drawer" : ""}`}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event);
        }}
      >
        <div className="shop-dialog__head">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <span aria-hidden="true" className="admin-meander admin-meander--sm" />
        <div className="shop-dialog__body">{children}</div>
        <div className="shop-dialog__foot">{footer}</div>
      </form>
    </dialog>
  );
}
