<!-- Source: https://docs.typesafe.ai/sdk/python/api/types/questions | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Questions

Provide state and ask yes/no, choice, and score questions using objects or dictionaries.

## State

`state` is the text or JSON object you want to ask questions about. It cannot be `None`, but values inside an object may be `None`.

## Question objects

Use `Noul`, `Choice`, `Score`, and `Box` to define questions with named arguments.

## typesafe\_sdk.NoulCriteria

Bases: <code><a href="https://typing-extensions.readthedocs.io/en/latest/index.html#typing_extensions.TypedDict">TypedDict</a></code>

Optional descriptions of the yes and no outcomes.

See the [noul primitive](https://docs.typesafe.ai/go/noul) for details.

### true

`instance-attribute`

Description of the yes outcome as text, an asset, a JSON object, or an array; `None` leaves it undescribed.

### false

`instance-attribute`

Description of the no outcome as text, an asset, a JSON object, or an array; `None` leaves it undescribed.

## typesafe\_sdk.Noul

`pydantic-model`

Bases: `_Question`, `wire.NoulQuestion`

A yes/no question with optional descriptions for either outcome.

See the [noul primitive](https://docs.typesafe.ai/go/noul) for details.

<Note>
  **Show JSON schema:**

  <Accordion title="Details">
    ```json theme={null}
    {
      "$defs": {
        "Content": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            }
          ]
        },
        "ContentValue": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "integer"
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            }
          ]
        },
        "NoulCriteria": {
          "additionalProperties": false,
          "description": "Optional descriptions of the yes and no outcomes.\n\nSee the [noul primitive](https://docs.typesafe.ai/go/noul) for details.",
          "properties": {
            "true": {
              "anyOf": [
                {
                  "$ref": "#/$defs/Content"
                },
                {
                  "type": "null"
                }
              ]
            },
            "false": {
              "anyOf": [
                {
                  "$ref": "#/$defs/Content"
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "title": "NoulCriteria",
          "type": "object"
        }
      },
      "additionalProperties": false,
      "description": "A yes/no question with optional descriptions for either outcome.\n\nSee the [noul primitive](https://docs.typesafe.ai/go/noul) for details.",
      "properties": {
        "type": {
          "const": "noul",
          "default": "noul",
          "title": "Type",
          "type": "string"
        },
        "instructions": {
          "anyOf": [
            {
              "$ref": "#/$defs/Content"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "criteria": {
          "anyOf": [
            {
              "$ref": "#/$defs/NoulCriteria"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "title": "Noul",
      "type": "object"
    }
    ```
  </Accordion>
</Note>

Fields:

* `type` (<code><a href="https://docs.python.org/3/library/typing.html#typing.Literal">Literal</a>\['noul']</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Noul.instructions">instructions</a></code> (<code><a href="/sdk/python/api/types/common#typesafe_sdk.Content">Content</a> | None</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Noul.criteria">criteria</a></code> (<code><a href="/sdk/python/api/types/questions#typesafe_sdk.NoulCriteria">NoulCriteria</a> | None</code>)

### instructions

`pydantic-field`

The question to ask, expressed as text, an asset, a JSON object, or an array; optional when `criteria` describes an outcome.

### criteria

`pydantic-field`

Optional descriptions of the yes and no outcomes; required when `instructions` is `None`.

## typesafe\_sdk.Choice

`pydantic-model`

Bases: `_Question`, `wire.ChoiceQuestion`

A question that selects between named alternatives.

See the [choice primitive](https://docs.typesafe.ai/go/choice) for details.

<Note>
  **Show JSON schema:**

  <Accordion title="Details">
    ```json theme={null}
    {
      "$defs": {
        "Content": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            }
          ]
        },
        "ContentValue": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "integer"
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            }
          ]
        }
      },
      "additionalProperties": false,
      "description": "A question that selects between named alternatives.\n\nSee the [choice primitive](https://docs.typesafe.ai/go/choice) for details.",
      "properties": {
        "type": {
          "const": "choice",
          "default": "choice",
          "title": "Type",
          "type": "string"
        },
        "instructions": {
          "anyOf": [
            {
              "$ref": "#/$defs/Content"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "criteria": {
          "additionalProperties": {
            "anyOf": [
              {
                "$ref": "#/$defs/Content"
              },
              {
                "type": "null"
              }
            ]
          },
          "title": "Criteria",
          "type": "object"
        }
      },
      "required": [
        "criteria"
      ],
      "title": "Choice",
      "type": "object"
    }
    ```
  </Accordion>
</Note>

Fields:

* `type` (<code><a href="https://docs.python.org/3/library/typing.html#typing.Literal">Literal</a>\['choice']</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Choice.criteria">criteria</a></code> (<code><a href="https://docs.python.org/3/library/collections.abc.html#collections.abc.Mapping">Mapping</a>\[<a href="https://docs.python.org/3/builtins/stdtypes.html#str">str</a>, <a href="/sdk/python/api/types/common#typesafe_sdk.Content">Content</a> | None]</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Choice.instructions">instructions</a></code> (<code><a href="/sdk/python/api/types/common#typesafe_sdk.Content">Content</a> | None</code>)

### criteria

`pydantic-field`

A nonempty mapping of labels to text, asset, object, or array descriptions, or `None` for undescribed labels.

### instructions

`pydantic-field`

The question to ask, expressed as text, an asset, a JSON object, or an array; optional.

## typesafe\_sdk.Score

`pydantic-model`

Bases: `_Question`, `wire.ScoreQuestion`

A question that assigns a score using an ordered rubric.

See the [score primitive](https://docs.typesafe.ai/go/score) for details.

<Note>
  **Show JSON schema:**

  <Accordion title="Details">
    ```json theme={null}
    {
      "$defs": {
        "Content": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            }
          ]
        },
        "ContentValue": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "integer"
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            }
          ]
        }
      },
      "additionalProperties": false,
      "description": "A question that assigns a score using an ordered rubric.\n\nSee the [score primitive](https://docs.typesafe.ai/go/score) for details.",
      "properties": {
        "type": {
          "const": "score",
          "default": "score",
          "title": "Type",
          "type": "string"
        },
        "instructions": {
          "anyOf": [
            {
              "$ref": "#/$defs/Content"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "criteria": {
          "items": {
            "$ref": "#/$defs/Content"
          },
          "minItems": 1,
          "title": "Criteria",
          "type": "array"
        }
      },
      "required": [
        "criteria"
      ],
      "title": "Score",
      "type": "object"
    }
    ```
  </Accordion>
</Note>

Fields:

* `type` (<code><a href="https://docs.python.org/3/library/typing.html#typing.Literal">Literal</a>\['score']</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Score.criteria">criteria</a></code> (<code><a href="https://docs.python.org/3/library/collections.abc.html#collections.abc.Sequence">Sequence</a>\[<a href="/sdk/python/api/types/common#typesafe_sdk.Content">Content</a>]</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Score.instructions">instructions</a></code> (<code><a href="/sdk/python/api/types/common#typesafe_sdk.Content">Content</a> | None</code>)

### criteria

`pydantic-field`

A nonempty, ordered list of text, asset, object, or array descriptions, one per score from zero.

### instructions

`pydantic-field`

The question to ask, expressed as text, an asset, a JSON object, or an array; optional.

## typesafe\_sdk.Box

`pydantic-model`

Bases: `_Question`, `wire.BoxQuestion`

A question that locates what its instructions describe in the request's image.

Examples:

```python theme={null}
from pathlib import Path

from typesafe_sdk import Box, BoxAnswer, Image, TypeSafeClient


def locate_dog(client: TypeSafeClient, photo: Path) -> BoxAnswer:
    result = client.system_one(
        state=Image(photo),
        questions={"dog": Box(instructions="The dog")},
        model="jev-preview",
    )
    return result.boxes["dog"]
```

<Note>
  **Show JSON schema:**

  <Accordion title="Details">
    ````json theme={null}
    {
      "$defs": {
        "Content": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            }
          ]
        },
        "ContentValue": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "integer"
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
            },
            {
              "items": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ContentValue"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "type": "object"
            }
          ]
        }
      },
      "additionalProperties": false,
      "description": "A question that locates what its instructions describe in the request's image.\n\nExamples:\n    ```python\n    from pathlib import Path\n\n    from typesafe_sdk import Box, BoxAnswer, Image, TypeSafeClient\n\n\n    def locate_dog(client: TypeSafeClient, photo: Path) -> BoxAnswer:\n        result = client.system_one(\n            state=Image(photo),\n            questions={\"dog\": Box(instructions=\"The dog\")},\n            model=\"jev-preview\",\n        )\n        return result.boxes[\"dog\"]\n    ```",
      "properties": {
        "type": {
          "const": "box",
          "default": "box",
          "title": "Type",
          "type": "string"
        },
        "instructions": {
          "anyOf": [
            {
              "$ref": "#/$defs/Content"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "title": "Box",
      "type": "object"
    }
    ````
  </Accordion>
</Note>

Fields:

* `type` (<code><a href="https://docs.python.org/3/library/typing.html#typing.Literal">Literal</a>\['box']</code>)
* <code><a href="/sdk/python/api/types/questions#typesafe_sdk.Box.instructions">instructions</a></code> (<code><a href="/sdk/python/api/types/common#typesafe_sdk.Content">Content</a> | None</code>)

### instructions

`pydantic-field`

What to locate in the request's image, expressed as text, an asset, a JSON object, or an array; optional.

## typesafe\_sdk.Question

`module-attribute`

A question object or question dictionary.

## typesafe\_sdk.Questions

`module-attribute`

Question inputs keyed by the names used to identify their answers.

## Question dictionaries

Question dictionaries include a `type` key: `"noul"`, `"choice"`, `"score"`, or `"box"`. You can mix dictionaries and question objects in the same request.

## typesafe\_sdk.NoulModel

Bases: <code><a href="https://typing-extensions.readthedocs.io/en/latest/index.html#typing_extensions.TypedDict">TypedDict</a></code>

A yes/no question dictionary with `type="noul"`.

See the [noul primitive](https://docs.typesafe.ai/go/noul) for details.

### type

`instance-attribute`

### instructions

`instance-attribute`

The question to ask, expressed as text, an asset, a JSON object, or an array; optional when `criteria` describes an outcome.

### criteria

`instance-attribute`

Optional descriptions of the yes and no outcomes; required when `instructions` is `None`.

## typesafe\_sdk.ChoiceModel

Bases: <code><a href="https://typing-extensions.readthedocs.io/en/latest/index.html#typing_extensions.TypedDict">TypedDict</a></code>

A choice question dictionary with `type="choice"`.

See the [choice primitive](https://docs.typesafe.ai/go/choice) for details.

### type

`instance-attribute`

### instructions

`instance-attribute`

The question to ask, expressed as text, an asset, a JSON object, or an array; optional.

### criteria

`instance-attribute`

A nonempty mapping of labels to text, asset, object, or array descriptions, or `None` for undescribed labels.

## typesafe\_sdk.ScoreModel

Bases: <code><a href="https://typing-extensions.readthedocs.io/en/latest/index.html#typing_extensions.TypedDict">TypedDict</a></code>

A score question dictionary with `type="score"`.

See the [score primitive](https://docs.typesafe.ai/go/score) for details.

### type

`instance-attribute`

### instructions

`instance-attribute`

The question to ask, expressed as text, an asset, a JSON object, or an array; optional.

### criteria

`instance-attribute`

A nonempty, ordered list of text, asset, object, or array descriptions, one per score from zero.

## typesafe\_sdk.BoxModel

Bases: <code><a href="https://typing-extensions.readthedocs.io/en/latest/index.html#typing_extensions.TypedDict">TypedDict</a></code>

A box question dictionary with `type="box"`.

### type

`instance-attribute`

### instructions

`instance-attribute`

What to locate in the request's image, expressed as text, an asset, a JSON object, or an array; optional.

## typesafe\_sdk.QuestionModel

`module-attribute`

A question dictionary identified by its `type` key.
