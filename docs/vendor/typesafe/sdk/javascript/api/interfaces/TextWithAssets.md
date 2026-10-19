<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/TextWithAssets | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: TextWithAssets

Text from a `withAssets` tagged template, with the assets interpolated into it.

## Properties

### assets

```ts theme={null}
readonly assets: readonly Image[];
```

The assets interpolated into the text, including those in nested `withAssets` text.

***

### text

```ts theme={null}
readonly text: string;
```

The text, with each asset replaced by its reference.

## Methods

### toJSON()

```ts theme={null}
toJSON(): string;
```

The text, written by `JSON.stringify` wherever this value appears in a request.

#### Returns

`string`

***

### toString()

```ts theme={null}
toString(): string;
```

#### Returns

`string`
