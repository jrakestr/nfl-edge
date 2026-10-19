<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/WithResponse | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: WithResponse<T>

Parsed data with its HTTP response and request ID.

## Type Parameters

### T

`T`

## Properties

### data

```ts theme={null}
data: T;
```

The parsed response body.

***

### requestId

```ts theme={null}
requestId: string | undefined;
```

Request ID from `x-typesafe-request-id`, or `undefined` when absent.

***

### response

```ts theme={null}
response: Response;
```

The HTTP response, with its body consumed by parsing.
