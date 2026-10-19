<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ContentValue | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Type Alias: ContentValue

```ts theme={null}
type ContentValue = 
  | string
  | number
  | boolean
  | null
  | Asset
  | TextWithAssets
  | ContentValue[]
  | {
[key: string]: ContentValue;
};
```

A JSON-compatible value that may also hold assets, each written as its name in `assets`, or
else as its reference.
