<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/SystemOneRequest | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: SystemOneRequest<Q>

State and named questions for `systemOne`.

Additional properties on a request variable are forwarded, including `null` values.

## Type Parameters

### Q

`Q` *extends* [`Questions`](/sdk/javascript/api/interfaces/Questions) = [`Questions`](/sdk/javascript/api/interfaces/Questions)

## Properties

### assets?

```ts theme={null}
optional assets?: Record<string, Image>;
```

References mapped to assets, for referencing assets by name.

References are matched literally in string values within `state`, question instructions,
or criteria. Use distinct delimiters (such as `<photo>`) to avoid matching ordinary text.
Assets placed directly in `state` or question content, or in `withAssets` text, are sent
without being listed here. Every name must appear in the request; otherwise the call
rejects before sending.

***

### model?

```ts theme={null}
optional model?: string;
```

Model override; omitted values inherit `defaultModel`.

***

### questions

```ts theme={null}
questions: Q;
```

Nonempty questions keyed by the names used to identify their answers.

***

### state

```ts theme={null}
state: NonNullable<EntryType>;
```

Text, an asset, a JSON object, or an array to evaluate.
