import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { DEFAULT_TABLE_STATE, parseTableState, tableStateToParams, useTableState } from "./table-state";
import { useUrlBoundState } from "./url-bound-state";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

let search = new URLSearchParams();
let live = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/players",
  useSearchParams: () => search,
}));

vi.mock("@/components/shell/GamesSelection", () => ({
  useLiveSearchParams: () => live,
}));

type S = { q: string; n: number };

function parse(sp: URLSearchParams): S {
  return { q: sp.get("q") ?? "", n: Number(sp.get("n") || 0) };
}

function apply(state: S, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  if (state.q) p.set("q", state.q);
  else p.delete("q");
  if (state.n) p.set("n", String(state.n));
  else p.delete("n");
  return p;
}

function wrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

beforeEach(() => {
  search = new URLSearchParams();
  live = new URLSearchParams();
  replace.mockReset();
  replace.mockImplementation((href: string) => {
    const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
    live = new URLSearchParams(qs);
    search = new URLSearchParams(qs);
  });
});

describe("useUrlBoundState", () => {
  it("StrictMode double updater navigates once from the effect, not from the setter", () => {
    const { result } = renderHook(() => useUrlBoundState({ parse, apply }), { wrapper });
    replace.mockClear();
    act(() => {
      result.current[1]((s) => ({ ...s, n: 1 }));
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]?.[0])).toContain("n=1");
  });

  it("does not replace on mount when apply only reorders existing keys", () => {
    search = new URLSearchParams("n=1&run=abc");
    live = new URLSearchParams("n=1&run=abc");
    renderHook(() => useUrlBoundState({ parse, apply }), { wrapper });
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not replace on mount when table apply moves TABLE_PARAMS to the end", () => {
    const qs = "sort=proj&view=table&run=abc&dir=desc&games=g1";
    search = new URLSearchParams(qs);
    live = new URLSearchParams(qs);
    renderHook(() => useUrlBoundState({ parse: parseTableState, apply: tableStateToParams }), {
      wrapper,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("identical params produce no replace", () => {
    const { result } = renderHook(() => useUrlBoundState({ parse, apply }), { wrapper });
    replace.mockClear();
    act(() => {
      result.current[1]((s) => ({ ...s, n: 0, q: "" }));
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("an external live change adopts", () => {
    const { result, rerender } = renderHook(() => useUrlBoundState({ parse, apply }), { wrapper });
    replace.mockClear();
    live = new URLSearchParams("q=gibbs");
    rerender();
    expect(result.current[0]).toEqual({ q: "gibbs", n: 0 });
  });

  it("adopting does not trigger a write", () => {
    const { rerender } = renderHook(() => useUrlBoundState({ parse, apply }), { wrapper });
    replace.mockClear();
    live = new URLSearchParams("q=gibbs");
    rerender();
    expect(replace).not.toHaveBeenCalled();
  });

  it("pending debounce write is cancelled when live adopts", () => {
    vi.useFakeTimers();
    search = new URLSearchParams("q=foo");
    live = new URLSearchParams("q=foo");
    const { result, rerender } = renderHook(
      () => useUrlBoundState({ parse, apply, debounceMs: 300, debounceKeys: ["q"] }),
      { wrapper },
    );
    replace.mockClear();
    act(() => {
      result.current[1]((s) => ({ ...s, n: 1 }));
    });
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockClear();
    act(() => {
      result.current[1]((s) => ({ ...s, q: "gibbs" }));
    });
    expect(result.current[0]).toEqual({ q: "gibbs", n: 1 });
    expect(replace).not.toHaveBeenCalled();
    live = new URLSearchParams("q=foo");
    rerender();
    expect(result.current[0]).toEqual({ q: "foo", n: 0 });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(replace).not.toHaveBeenCalled();
    expect(result.current[0]).toEqual({ q: "foo", n: 0 });
    vi.useRealTimers();
  });

  it("pending debounce write does not fire after unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(
      () => useUrlBoundState({ parse, apply, debounceMs: 300, debounceKeys: ["q"] }),
      { wrapper },
    );
    replace.mockClear();
    act(() => {
      result.current[1]((s) => ({ ...s, q: "gibbs" }));
    });
    expect(replace).not.toHaveBeenCalled();
    unmount();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(replace).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("adopt updates lastWritten so a later user edit still writes", () => {
    const { result, rerender } = renderHook(() => useUrlBoundState({ parse, apply }), { wrapper });
    act(() => {
      result.current[1]((s) => ({ ...s, n: 1 }));
    });
    expect(replace).toHaveBeenCalled();
    replace.mockClear();
    live = new URLSearchParams("q=foo");
    rerender();
    expect(result.current[0]).toEqual({ q: "foo", n: 0 });
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      result.current[1]((s) => ({ ...s, n: 2 }));
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]?.[0])).toContain("n=2");
    expect(String(replace.mock.calls[0]?.[0])).toContain("q=foo");
  });

  it("enabled: false neither writes nor adopts", () => {
    const { result, rerender } = renderHook(
      () => useUrlBoundState({ parse, apply, enabled: false }),
      { wrapper },
    );
    expect(result.current[0]).toEqual({ q: "", n: 0 });
    act(() => {
      result.current[1]({ q: "x", n: 2 });
    });
    expect(replace).not.toHaveBeenCalled();
    expect(result.current[0]).toEqual({ q: "x", n: 2 });
    live = new URLSearchParams("n=9");
    rerender();
    expect(result.current[0]).toEqual({ q: "x", n: 2 });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("useTableState", () => {
  it("disabled stays on DEFAULT_TABLE_STATE and neither writes nor adopts", () => {
    const { result, rerender } = renderHook(() => useTableState(false), { wrapper });
    expect(result.current[0]).toEqual(DEFAULT_TABLE_STATE);
    act(() => {
      result.current[1]({ q: "gibbs" });
    });
    expect(result.current[0].q).toBe("gibbs");
    expect(replace).not.toHaveBeenCalled();
    live = new URLSearchParams("sort=proj&q=other");
    rerender();
    expect(result.current[0].q).toBe("gibbs");
    expect(result.current[0].sort).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
