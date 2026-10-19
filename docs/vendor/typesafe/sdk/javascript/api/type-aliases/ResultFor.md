<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ResultFor | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Type Alias: ResultFor<T>

```ts theme={null}
type ResultFor<T> = T extends NoulQuestion ? NoulResponse : T extends ScoreQuestion<infer S> ? ScoreResponse<S> : T extends ChoiceQuestion<infer E> ? ChoiceResponse<E> : T extends BoxQuestion ? BoxResponse : never;
```

The answer type for a question, preserving its criteria keys.

## Type Parameters

### T

`T` *extends* [`Question`](/sdk/javascript/api/type-aliases/Question)
