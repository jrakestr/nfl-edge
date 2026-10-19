<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/functions/image | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Function: image()

```ts theme={null}
function image(data): Image;
```

Create an image asset for `systemOne`.

Place the image in `state` or question content, or interpolate it into a `withAssets`
tagged template; either way it is sent under its own reference, `String(image)`. To
reference it by a name of your choice, pass it in `assets` instead.

The image must be PNG or JPEG. The API detects the format from the file bytes and rejects
other formats with a `BadRequestError`. `Blob` data is read when the request is sent, and its
`type` is ignored. For base64 text, use `Image.fromBase64`.

## Parameters

### data

`ArrayBuffer` | `ArrayBufferView`\<`ArrayBufferLike`> | `Blob`

Image file bytes, or a `Blob` such as a `File`.

## Returns

[`Image`](/sdk/javascript/api/classes/Image)

## Throws

`data` is empty or isn't file bytes or a `Blob`.

## Example

```ts theme={null}
// Node: `openAsBlob` reads a file as a Blob and is exported by "node:fs".
const { answers } = await client.systemOne({
  state: image(await openAsBlob("product.png")),
  questions: { damaged: noul("Is the product damaged?") },
});
```
