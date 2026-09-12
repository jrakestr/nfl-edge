import type { LP, Result } from "glpk.js";

export type GlpkApi = {
  GLP_MAX: number;
  GLP_LO: number;
  GLP_UP: number;
  GLP_DB: number;
  GLP_FX: number;
  GLP_MSG_OFF: number;
  GLP_OPT: number;
  GLP_FEAS: number;
  solve: (lp: LP, options?: { msglev: number; presol: boolean }) => Result | Promise<Result>;
};

let instance: Promise<GlpkApi> | null = null;

/** Browser WASM / worker. Tests mock this module to use `glpk.js/node`. */
export async function getGlpk(): Promise<GlpkApi> {
  if (!instance) {
    instance = (async () => {
      const mod = await import("glpk.js");
      return (mod.default as () => Promise<GlpkApi>)();
    })();
  }
  return instance;
}
