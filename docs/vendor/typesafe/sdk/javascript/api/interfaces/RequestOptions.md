<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/RequestOptions | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: RequestOptions

Per-call options that override client settings.

## Properties

### headers?

```ts theme={null}
optional headers?: Record<string, string>;
```

Additional headers, merged over `defaultHeaders`.

***

### retry?

```ts theme={null}
optional retry?: Partial<RetryPolicy>;
```

Retry overrides for this call; omitted fields inherit client settings.

***

### signal?

```ts theme={null}
optional signal?: AbortSignal;
```

Cancellation signal for the request and pending retries.

***

### timeout?

```ts theme={null}
optional timeout?: number;
```

Timeout per attempt in milliseconds; there is no total retry budget.
