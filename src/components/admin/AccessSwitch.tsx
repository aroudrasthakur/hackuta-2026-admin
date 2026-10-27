/** On/Off switch for one permission. The visible On/Off text means state never relies on color alone. */
export function AccessSwitch({ checked, onChange, label, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Participant check-in". */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="admin-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="admin-switch__track" aria-hidden="true"><span className="admin-switch__thumb" /></span>
      <span className="admin-switch__text" aria-hidden="true">{checked ? "On" : "Off"}</span>
    </button>
  );
}
