// @vitest-environment happy-dom
import { act, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByLabelText, getByRole } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPasswordInput } from "../../src/components/SignInPasswordInput";

function renderPasswordField(id: string, label = "Password") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <div className="sign-in-field">
        <label className="sign-in-field__label" htmlFor={id}>
          {label}
        </label>
        <SignInPasswordInput id={id} />
      </div>,
    );
  });

  return {
    container,
    root,
    input: getByLabelText(container, label, { exact: true }) as HTMLInputElement,
    toggle: getByRole(container, "button", { name: "Show password" }),
  };
}

describe("SignInPasswordInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root.unmount());
      container?.remove();
    }
  });

  it("masks the password initially", () => {
    const field = renderPasswordField("admin-sign-in-password");
    container = field.container;
    root = field.root;

    expect(field.input.getAttribute("type")).toBe("password");
    expect(field.toggle.getAttribute("aria-label")).toBe("Show password");
    expect(field.toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("reveals and hides the password when the toggle is clicked", async () => {
    const field = renderPasswordField("admin-sign-in-password");
    container = field.container;
    root = field.root;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(field.input, "SecurePass1");
      field.input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      field.toggle.click();
    });

    expect(field.input.getAttribute("type")).toBe("text");
    expect(field.input.value).toBe("SecurePass1");
    expect(getByRole(container, "button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    await act(async () => {
      getByRole(container, "button", { name: "Hide password" }).click();
    });

    expect(field.input.getAttribute("type")).toBe("password");
    expect(field.input.value).toBe("SecurePass1");
    expect(getByRole(container, "button", { name: "Show password" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("does not submit the surrounding form when the toggle is clicked", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    await act(async () => {
      root.render(
        <form onSubmit={onSubmit}>
          <div className="sign-in-field">
            <label className="sign-in-field__label" htmlFor="admin-sign-in-password">
              Password
            </label>
            <SignInPasswordInput id="admin-sign-in-password" />
          </div>
          <button type="submit">Sign in</button>
        </form>,
      );
    });

    await act(async () => {
      getByRole(container, "button", { name: "Show password" }).click();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByRole(container, "button", { name: "Hide password" }).getAttribute("type")).toBe("button");
  });
});
