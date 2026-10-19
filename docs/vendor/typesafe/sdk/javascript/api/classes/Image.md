<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/classes/Image | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Class: Image

A PNG or JPEG image asset, created by `image` or `Image.fromBase64`.

## Constructors

### Constructor

```ts theme={null}
new Image(data): Image;
```

#### Parameters

##### data

`ArrayBuffer` | `ArrayBufferView`\<`ArrayBufferLike`> | `Blob`

#### Returns

`Image`

#### Throws

`data` is empty or isn't file bytes or a `Blob`.

## Properties

### data

```ts theme={null}
readonly data: Uint8Array<ArrayBufferLike> | Blob;
```

The image file bytes, or a `Blob` read when the request is sent.

***

### type

```ts theme={null}
readonly type: "image" = "image";
```

## Methods

### toJSON()

```ts theme={null}
toJSON(): string;
```

The reference, written by `JSON.stringify` wherever the image appears in a request.

#### Returns

`string`

***

### toString()

```ts theme={null}
toString(): string;
```

The unique reference this image is sent under, for referencing it inside text.

#### Returns

`string`

***

### fromBase64()

```ts theme={null}
static fromBase64(text): Image;
```

Create an image from base64-encoded file bytes, decoding them now.

#### Parameters

##### text

`string`

The image file bytes, base64-encoded, without a `data:` URL prefix.

#### Returns

`Image`

#### Throws

`text` isn't valid base64 or decodes to no bytes.

#### Example

```ts theme={null}
const photo = Image.fromBase64(upload.photoBase64);
```
