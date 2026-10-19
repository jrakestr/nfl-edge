<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/type-aliases/SentContent | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Type Alias: SentContent<T>

```ts theme={null}
type SentContent<T> = T extends Asset | TextWithAssets ? string : T extends object ? { readonly [key in keyof T]: SentContent<T[key]> } : T;
```

Content as the API returns it, with assets and `withAssets` text written as strings.

## Type Parameters

### T

`T`
