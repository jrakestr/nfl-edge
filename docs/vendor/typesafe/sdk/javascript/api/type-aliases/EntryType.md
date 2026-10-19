<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/type-aliases/EntryType | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Type Alias: EntryType

```ts theme={null}
type EntryType = 
  | string
  | Asset
  | TextWithAssets
  | {
[key: string]: ContentValue;
}
  | ContentValue[]
  | null;
```

Text, an asset, a JSON object or array, or `null` for instructions and criteria.

Each asset in it is written as its name in `assets`, or else as its reference, and sent
with the request.
