<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/ScoreQuestion | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: ScoreQuestion<T>

A question that assigns a score using an ordered rubric.

## Type Parameters

### T

`T` *extends* [`ScoreCriteria`](/sdk/javascript/api/type-aliases/ScoreCriteria) = [`ScoreCriteria`](/sdk/javascript/api/type-aliases/ScoreCriteria)

## Properties

### criteria

```ts theme={null}
criteria: T;
```

Descriptions of the available outcomes.

***

### instructions?

```ts theme={null}
optional instructions?: EntryType;
```

The question as text, a JSON object, or an array; optional or `null`.

***

### type

```ts theme={null}
type: "score";
```
