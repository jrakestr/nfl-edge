<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ScoreLegend | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Type Alias: ScoreLegend<T>

```ts theme={null}
type ScoreLegend<T> = { readonly [score in ScoreOf<T>]: SentContent<T[score]> };
```

Rubric descriptions keyed by score.

## Type Parameters

### T

`T` *extends* [`ScoreCriteria`](/sdk/javascript/api/type-aliases/ScoreCriteria)
