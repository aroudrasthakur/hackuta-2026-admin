// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeMediaQuery } from "../../src/lib/matchMediaSubscribe";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribeMediaQuery", () => {
  it("uses addEventListener when available", () => {
    const add = vi.fn();
    const remove = vi.fn();
    const media = {
      matches: false,
      addEventListener: add,
      removeEventListener: remove,
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(media as MediaQueryList);

    const listener = vi.fn();
    const unsubscribe = subscribeMediaQuery("(max-width: 639px)", listener);
    expect(listener).toHaveBeenCalledWith(false);

    media.matches = true;
    add.mock.calls[0]?.[1]();
    expect(listener).toHaveBeenLastCalledWith(true);

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });

  it("falls back to addListener on legacy MediaQueryList", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const media = {
      matches: true,
      addListener,
      removeListener,
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(media as MediaQueryList);

    const listener = vi.fn();
    const unsubscribe = subscribeMediaQuery("(max-width: 639px)", listener);
    expect(listener).toHaveBeenCalledWith(true);
    expect(addListener).toHaveBeenCalled();

    unsubscribe();
    expect(removeListener).toHaveBeenCalled();
  });
});
