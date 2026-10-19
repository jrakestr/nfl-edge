<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/ChoiceQuestion | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: ChoiceQuestion<T>

A question that selects between named alternatives.

## Type Parameters

### T

`T` *extends* [`ChoiceCriteria`](/sdk/javascript/api/type-aliases/ChoiceCriteria) = [`ChoiceCriteria`](/sdk/javascript/api/type-aliases/ChoiceCriteria)

## Properties

### criteria

```ts theme={null}
criteria: T;
```

Descriptions of the available outcomes; at least one label is required.

***

### instructions?

```ts theme={null}
optional instructions?: EntryType;
```

The question as text, a JSON object, or an array; optional or `null`.

***

### type

```ts theme={null}
type: "choice";
```
