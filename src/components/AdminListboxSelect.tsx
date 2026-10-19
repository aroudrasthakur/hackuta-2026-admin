import { memo, useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import { DropdownChevron } from "./DropdownChevron";
import { useDropdownDismiss } from "./useDropdownDismiss";

export type AdminListboxOption = {
  value: string;
  label: string;
};

type AdminListboxSelectProps = {
  id: string;
  label: string;
  value: string;
  options: readonly AdminListboxOption[];
  onChange: (value: string) => void;
  controlClassName?: string;
};

export const AdminListboxSelect = memo(function AdminListboxSelect({
  id,
  label,
  value,
  options,
  onChange,
  controlClassName = "admin-field__control",
}: AdminListboxSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const closeList = useCallback(() => setOpen(false), []);
  useDropdownDismiss(containerRef, open, closeList);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = options[selectedIndex]?.label ?? value;
  const activeOptionIndex =
    options.length === 0 ? 0 : Math.min(activeIndex, options.length - 1);

  const openList = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  const selectOption = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      closeList();
    },
    [closeList, onChange],
  );

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openList();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && options[activeOptionIndex]) {
      event.preventDefault();
      selectOption(options[activeOptionIndex]!.value);
    }
  };

  const labelId = `${id}-label`;

  return (
    <div className="admin-field">
      <label id={labelId} htmlFor={id}>
        {label}
      </label>
      <div ref={containerRef} className={open ? "relative z-30" : "relative"}>
        <div className="relative">
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            aria-labelledby={labelId}
            data-value={value}
            className={`${controlClassName} w-full cursor-pointer pr-10 text-left`}
            onClick={() => (open ? closeList() : openList())}
            onKeyDown={handleTriggerKeyDown}
          >
            {selectedLabel}
          </button>
          <DropdownChevron active={open} />
        </div>

        {open ? (
          <ul id={listboxId} role="listbox" className="admin-listbox-panel">
            {options.map((option, index) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  data-value={option.value}
                  className={`admin-listbox-option ${
                    index === activeOptionIndex || option.value === value ? "admin-listbox-option--active" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option.value)}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
});
