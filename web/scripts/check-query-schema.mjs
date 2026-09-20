#!/usr/bin/env node
/**
 * Fail if a web query names a column that is not on the generated table/view.
 * postgres.js templates are untyped; this is the rename gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TYPES = path.join(WEB_ROOT, "src/lib/database.types.ts");
const DEFAULT_QUERIES = path.join(WEB_ROOT, "src/lib/queries");

const SCHEMAS = new Set(["model", "raw"]);
const JOIN_KEYWORDS = new Set([
  "on",
  "where",
  "left",
  "right",
  "inner",
  "cross",
  "full",
  "join",
  "outer",
  "order",
  "group",
  "limit",
  "union",
  "and",
  "or",
  "select",
  "with",
  "using",
  "natural",
  "only",
  "as",
  "set",
  "having",
  "window",
  "except",
  "intersect",
  "lateral",
  "into",
]);

/** @typedef {Record<string, Record<string, Set<string>>>} SchemaMap */

/** @param {string} source */
export function parseSchema(source) {
  /** @type {SchemaMap} */
  const schema = {};
  let currentSchema = null;
  let currentTable = null;
  let inRow = false;

  for (const line of source.split("\n")) {
    const schemaMatch = line.match(/^  (\w+): \{$/);
    if (schemaMatch && schemaMatch[1] !== "__InternalSupabase") {
      currentSchema = schemaMatch[1];
      schema[currentSchema] ??= {};
      currentTable = null;
      inRow = false;
      continue;
    }
    const tableMatch = line.match(/^      (\w+): \{$/);
    if (tableMatch && currentSchema) {
      currentTable = tableMatch[1];
      schema[currentSchema][currentTable] = new Set();
      inRow = false;
      continue;
    }
    if (/^        Row: \{$/.test(line) && currentTable) {
      inRow = true;
      continue;
    }
    if (inRow && /^        \}$/.test(line)) {
      inRow = false;
      continue;
    }
    const col = line.match(/^          (\w+):/);
    if (inRow && col && currentSchema && currentTable) {
      schema[currentSchema][currentTable].add(col[1]);
    }
  }
  return schema;
}

/** @param {string} source */
export function extractSql(source) {
  const blocks = [];
  const re = /sql\(\)`([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(source))) {
    blocks.push(m[1].replace(/\$\{[^}]+\}/g, "null"));
  }
  return blocks;
}

/** @param {string} sql */
function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** @param {string} sql */
export function cteNames(sql) {
  const names = new Set();
  const re = /\b(\w+)\s+as\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) names.add(m[1].toLowerCase());
  return names;
}

/**
 * @param {string} sql
 * @returns {{ aliases: Map<string, { schema: string, table: string }[]>, skip: Set<string> }}
 */
export function tableAliases(sql) {
  const ctes = cteNames(sql);
  const skip = new Set(ctes);
  /** @type {Map<string, { schema: string, table: string }[]>} */
  const aliases = new Map();

  const add = (name, schema, table) => {
    const key = name.toLowerCase();
    if (skip.has(key)) return;
    const list = aliases.get(key) ?? [];
    list.push({ schema, table });
    aliases.set(key, list);
  };

  const tableRe = /\b(?:from|join)\s+(model|raw)\.(\w+)(?:\s+(?:as\s+)?(\w+))?/gi;
  let m;
  while ((m = tableRe.exec(sql))) {
    const schema = m[1];
    const table = m[2];
    add(table, schema, table);
    const rawAlias = m[3];
    if (!rawAlias || JOIN_KEYWORDS.has(rawAlias.toLowerCase())) continue;
    add(rawAlias, schema, table);
  }

  const cteAliasRe = /\b(?:from|join)\s+(\w+)(?:\s+(?:as\s+)?(\w+))?/gi;
  let c;
  while ((c = cteAliasRe.exec(sql))) {
    const head = c[1].toLowerCase();
    if (SCHEMAS.has(head) || !ctes.has(head)) continue;
    const rawAlias = c[2];
    if (!rawAlias || JOIN_KEYWORDS.has(rawAlias.toLowerCase())) continue;
    skip.add(rawAlias.toLowerCase());
    aliases.delete(rawAlias.toLowerCase());
  }

  return { aliases, skip };
}

/**
 * @param {string} sql
 * @param {SchemaMap} schema
 * @param {string} label
 * @returns {string[]}
 */
export function checkSql(sql, schema, label) {
  const cleaned = stripSqlComments(sql);
  const { aliases, skip } = tableAliases(cleaned);
  const errors = [];
  const re = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g;
  let m;
  while ((m = re.exec(cleaned))) {
    const left = m[1];
    const col = m[2];
    if (SCHEMAS.has(left.toLowerCase())) continue;
    if (skip.has(left.toLowerCase())) continue;
    const bindings = aliases.get(left.toLowerCase());
    if (!bindings?.length) continue;
    const missing = [];
    let found = false;
    for (const resolved of bindings) {
      const cols = schema[resolved.schema]?.[resolved.table];
      if (!cols) {
        missing.push(`${resolved.schema}.${resolved.table} is not in generated types`);
        continue;
      }
      if (cols.has(col)) {
        found = true;
        break;
      }
      missing.push(`${left}.${col} does not exist on ${resolved.schema}.${resolved.table}`);
    }
    if (!found) errors.push(`${label}: ${missing[0]}`);
  }
  return errors;
}

/**
 * @param {{ typesPath?: string, queriesDir?: string, extraSql?: { label: string, sql: string }[] }} [opts]
 */
export function checkQuerySchema(opts = {}) {
  const typesPath = opts.typesPath ?? DEFAULT_TYPES;
  const queriesDir = opts.queriesDir ?? DEFAULT_QUERIES;
  const schema = parseSchema(fs.readFileSync(typesPath, "utf8"));
  const errors = [];

  if (fs.existsSync(queriesDir)) {
    for (const name of fs.readdirSync(queriesDir).sort()) {
      if (!name.endsWith(".ts")) continue;
      const file = path.join(queriesDir, name);
      const source = fs.readFileSync(file, "utf8");
      extractSql(source).forEach((sql, i) => {
        errors.push(...checkSql(sql, schema, `${name}#${i}`));
      });
    }
  }

  for (const extra of opts.extraSql ?? []) {
    errors.push(...checkSql(extra.sql, schema, extra.label));
  }

  return { schema, errors };
}

function main() {
  const { errors } = checkQuerySchema();
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
