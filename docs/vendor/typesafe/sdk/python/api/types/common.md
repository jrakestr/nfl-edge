<!-- Source: https://docs.typesafe.ai/sdk/python/api/types/common | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Common types

Common types for TypeSafe API SDK.

## typesafe\_sdk.JSONValue

`module-attribute`

A JSON-like value. May be nested and contain `None`.

## typesafe\_sdk.JSONContent

`module-attribute`

Either a plain string or a mapping/sequence of [`JSONValue`](/sdk/python/api/types/common#typesafe_sdk.JSONValue) entries.

## typesafe\_sdk.ContentValue

`module-attribute`

A JSON-like value that may also hold [assets](/sdk/python/api/types/assets#typesafe_sdk.Asset). May be nested and contain `None`.

## typesafe\_sdk.Content

`module-attribute`

Text, an [asset](/sdk/python/api/types/assets#typesafe_sdk.Asset), or a mapping/sequence of [`ContentValue`](/sdk/python/api/types/common#typesafe_sdk.ContentValue) entries.

Each asset is sent in the request's assets, with its unique reference in its place.
