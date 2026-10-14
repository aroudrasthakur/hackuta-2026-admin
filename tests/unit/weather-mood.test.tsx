// @vitest-environment happy-dom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StormPageFrame } from "../../src/components/StormPageFrame";
import { WeatherMoodToggle } from "../../src/components/WeatherMoodToggle";
import { WeatherMoodProvider } from "../../src/hooks/useWeatherMood";

vi.mock("../../src/components/SignInStormBackdrop", () => ({
  SignInStormBackdrop: ({ active }: { active?: boolean }) => (
    <div data-testid="storm-backdrop" data-active={active ? "true" : "false"} />
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(node: ReactNode) {
  await act(async () => root.render(<StrictMode>{node}</StrictMode>));
}

const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((el) => el.textContent === name);

describe("weather mood", () => {
  it("defaults to enraged storm on admin frame", async () => {
    await render(
      <StormPageFrame>
        <p>Admin content</p>
      </StormPageFrame>,
    );

    expect(container.querySelector('[data-testid="storm-backdrop"]')?.getAttribute("data-active")).toBe(
      "true",
    );
    expect(button("Enrage")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("calms the storm when Calm is selected", async () => {
    await render(
      <WeatherMoodProvider>
        <WeatherMoodToggle />
      </WeatherMoodProvider>,
    );

    await act(async () => button("Calm")!.click());
    expect(button("Calm")?.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("hackuta-weather-mood")).toBe("calm");
  });

});
