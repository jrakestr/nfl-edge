<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/type-aliases/JsonValue | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Type Alias: JsonValue

```ts theme={null}
type JsonValue = 
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
[key: string]: JsonValue;
};
```

A JSON-compatible value.
