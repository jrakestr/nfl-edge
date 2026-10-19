<!-- Source: https://docs.typesafe.ai/sdk/javascript/changelog | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Changelog

## v0.7.0 (2026-10-14)

### Breaking changes

* require Node.js 22 or newer
* stop exporting request payload types

### Features

* support images, as an experimental feature enabled with the `TypeSafe-Danger-Zone-Images: true` header: create them with `image()` or `Image.fromBase64()`, then place them in `state`, question instructions, or criteria, write them into text with `withAssets` and `withAssets.join`, or reference them by names you choose in `assets`
* add `box` questions, which locate what their instructions describe in an image; use them with the `jev-preview` model
* compress request bodies of 1 KiB or more with zstd on Node.js 22.15 or newer; pass `compression: false` to send them uncompressed

### Bug fixes

* allow null token counts in usage
* add more request validation checks
* reject the returned promise for invalid requests instead of throwing
* accept score criteria lists built at runtime
* stop an unhandled rejection on Node.js 22 when a request times out or is aborted mid-body

## v0.6.0 (2026-09-15)

### Breaking changes

* accept `Score.criteria` as an ordered sequence instead of a dictionary keyed by integers

## v0.5.7 (2026-09-11)

This is the initial public release of TypeSafe JavaScript and TypeScript SDK. Learn more in the [documentation](https://docs.typesafe.ai/go/js-sdk).
