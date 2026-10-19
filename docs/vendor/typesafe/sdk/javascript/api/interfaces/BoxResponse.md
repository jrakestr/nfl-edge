<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/BoxResponse | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: BoxResponse

The answer to a `box` question.

## Properties

### box

```ts theme={null}
readonly box: BoxCoordinates;
```

Where the instructions' subject is in the image.

***

### confidence

```ts theme={null}
readonly confidence: number | null;
```

Confidence in the box, from zero to one, or `null` when the API didn't report it.

***

### type

```ts theme={null}
readonly type: "box";
```
