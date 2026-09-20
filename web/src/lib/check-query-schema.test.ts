import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkQuerySchema, checkSql, parseSchema } from "../../scripts/check-query-schema.mjs";

const typesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "database.types.ts");

const originMainExposure = `
    select e.player_id,
           coalesce(p.display_name, e.player_id) as name,
           e.sim_own::float8 as sim_own,
           e.proj_own::float8 as proj_own,
           e.leverage::float8 as leverage
    from model.dfs_exposure e
    left join raw.players p on p.gsis_id = e.player_id
    order by e.sim_own desc`;

const originMainPlayers = `
    select e.proj_own::float8 as proj_own
    from raw.dk_salaries s
    left join model.dfs_exposure e
      on e.player_id = s.player_id`;

describe("check-query-schema", () => {
  const schema = parseSchema(readFileSync(typesPath, "utf8"));

  it("fails the origin/main sim_own and proj_own selects", () => {
    const exposure = checkSql(originMainExposure, schema, "origin-dfs");
    expect(exposure.some((e) => e.includes("e.sim_own"))).toBe(true);
    expect(exposure.some((e) => e.includes("e.proj_own"))).toBe(true);

    const players = checkSql(originMainPlayers, schema, "origin-players");
    expect(players.some((e) => e.includes("e.proj_own"))).toBe(true);
  });

  it("accepts the current query files against generated types", () => {
    const { errors } = checkQuerySchema({ typesPath });
    expect(errors).toEqual([]);
  });
});
