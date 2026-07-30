import D from"ajv";var nn=new TextEncoder().encode(`{
  "$comment": "This file is auto-generated from docs/reference/api/openapi.yaml. Do not edit manually. Run 'make generate-schema' to update.",
  "$id": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "$ref": "#/definitions/ServerDetail",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "Argument": {
      "anyOf": [
        {
          "$ref": "#/definitions/PositionalArgument"
        },
        {
          "$ref": "#/definitions/NamedArgument"
        }
      ],
      "description": "Warning: Arguments construct command-line parameters that may contain user-provided input. This creates potential command injection risks if clients execute commands in a shell environment. For example, a malicious argument value like ';rm -rf ~/Development' could execute dangerous commands. Clients should prefer non-shell execution methods (e.g., posix_spawn) when possible to eliminate injection risks entirely. Where not possible, clients should obtain consent from users or agents to run the resolved command before execution."
    },
    "Icon": {
      "description": "An optionally-sized icon that can be displayed in a user interface.",
      "properties": {
        "mimeType": {
          "description": "Optional MIME type override if the source MIME type is missing or generic. Must be one of: image/png, image/jpeg, image/jpg, image/svg+xml, image/webp.",
          "enum": [
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/svg+xml",
            "image/webp"
          ],
          "example": "image/png",
          "type": "string"
        },
        "sizes": {
          "description": "Optional array of strings that specify sizes at which the icon can be used. Each string should be in WxH format (e.g., '48x48', '96x96') or 'any' for scalable formats like SVG. If not provided, the client should assume that the icon can be used at any size.",
          "examples": [
            [
              "48x48",
              "96x96"
            ],
            [
              "any"
            ]
          ],
          "items": {
            "pattern": "^(\\\\d+x\\\\d+|any)$",
            "type": "string"
          },
          "type": "array"
        },
        "src": {
          "description": "A standard URI pointing to an icon resource. Must be an HTTPS URL. Consumers SHOULD take steps to ensure URLs serving icons are from the same domain as the server or a trusted domain. Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain executable JavaScript.",
          "example": "https://example.com/icon.png",
          "format": "uri",
          "maxLength": 255,
          "type": "string"
        },
        "theme": {
          "description": "Optional specifier for the theme this icon is designed for. 'light' indicates the icon is designed to be used with a light background, and 'dark' indicates the icon is designed to be used with a dark background. If not provided, the client should assume the icon can be used with any theme.",
          "enum": [
            "light",
            "dark"
          ],
          "type": "string"
        }
      },
      "required": [
        "src"
      ],
      "type": "object"
    },
    "Input": {
      "properties": {
        "choices": {
          "description": "A list of possible values for the input. If provided, the user must select one of these values.",
          "example": [],
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "default": {
          "description": "The default value for the input.  This should be a valid value for the input.  If you want to provide input examples or guidance, use the \`placeholder\` field instead.",
          "type": "string"
        },
        "description": {
          "description": "A description of the input, which clients can use to provide context to the user.",
          "type": "string"
        },
        "format": {
          "default": "string",
          "description": "Specifies the input format. Supported values include \`filepath\`, which should be interpreted as a file on the user's filesystem.\\n\\nWhen the input is converted to a string, booleans should be represented by the strings \\"true\\" and \\"false\\", and numbers should be represented as decimal values.",
          "enum": [
            "string",
            "number",
            "boolean",
            "filepath"
          ],
          "type": "string"
        },
        "isRequired": {
          "default": false,
          "type": "boolean"
        },
        "isSecret": {
          "default": false,
          "description": "Indicates whether the input is a secret value (e.g., password, token). If true, clients should handle the value securely.",
          "type": "boolean"
        },
        "placeholder": {
          "description": "A placeholder for the input to be displaying during configuration. This is used to provide examples or guidance about the expected form or content of the input.",
          "type": "string"
        },
        "value": {
          "description": "The value for the input. If this is not set, the user may be prompted to provide a value. If a value is set, it should not be configurable by end users.\\n\\nIdentifiers wrapped in \`{curly_braces}\` will be replaced with the corresponding properties from the input \`variables\` map. If an identifier in braces is not found in \`variables\`, or if \`variables\` is not provided, the \`{curly_braces}\` substring should remain unchanged.\\n",
          "type": "string"
        }
      },
      "type": "object"
    },
    "InputWithVariables": {
      "allOf": [
        {
          "$ref": "#/definitions/Input"
        },
        {
          "properties": {
            "variables": {
              "additionalProperties": {
                "$ref": "#/definitions/Input"
              },
              "description": "A map of variable names to their values. Keys in the input \`value\` that are wrapped in \`{curly_braces}\` will be replaced with the corresponding variable values.",
              "type": "object"
            }
          },
          "type": "object"
        }
      ]
    },
    "KeyValueInput": {
      "allOf": [
        {
          "$ref": "#/definitions/InputWithVariables"
        },
        {
          "properties": {
            "name": {
              "description": "Name of the header or environment variable.",
              "example": "SOME_VARIABLE",
              "type": "string"
            }
          },
          "required": [
            "name"
          ],
          "type": "object"
        }
      ]
    },
    "LocalTransport": {
      "anyOf": [
        {
          "$ref": "#/definitions/StdioTransport"
        },
        {
          "$ref": "#/definitions/StreamableHttpTransport"
        },
        {
          "$ref": "#/definitions/SseTransport"
        }
      ],
      "description": "Transport protocol configuration for local/package context"
    },
    "NamedArgument": {
      "allOf": [
        {
          "$ref": "#/definitions/InputWithVariables"
        },
        {
          "properties": {
            "isRepeated": {
              "default": false,
              "description": "Whether the argument can be repeated multiple times.",
              "type": "boolean"
            },
            "name": {
              "description": "The flag name, including any leading dashes.",
              "example": "--port",
              "type": "string"
            },
            "type": {
              "enum": [
                "named"
              ],
              "example": "named",
              "type": "string"
            }
          },
          "required": [
            "type",
            "name"
          ],
          "type": "object"
        }
      ],
      "description": "A command-line \`--flag={value}\`."
    },
    "Package": {
      "properties": {
        "environmentVariables": {
          "description": "A mapping of environment variables to be set when running the package.",
          "items": {
            "$ref": "#/definitions/KeyValueInput"
          },
          "type": "array"
        },
        "fileSha256": {
          "description": "SHA-256 hash of the package file for integrity verification. Required for MCPB packages and optional for other package types. Authors are responsible for generating correct SHA-256 hashes when creating server.json. If present, MCP clients must validate the downloaded file matches the hash before running packages to ensure file integrity.",
          "example": "fe333e598595000ae021bd27117db32ec69af6987f507ba7a63c90638ff633ce",
          "pattern": "^[a-f0-9]{64}$",
          "type": "string"
        },
        "identifier": {
          "description": "Package identifier - either a package name (for registries) or URL (for direct downloads)",
          "examples": [
            "@modelcontextprotocol/server-brave-search",
            "https://github.com/example/releases/download/v1.0.0/package.mcpb"
          ],
          "type": "string"
        },
        "packageArguments": {
          "description": "A list of arguments to be passed to the package's binary.",
          "items": {
            "$ref": "#/definitions/Argument"
          },
          "type": "array"
        },
        "registryBaseUrl": {
          "description": "Base URL of the package registry",
          "examples": [
            "https://registry.npmjs.org",
            "https://pypi.org",
            "https://docker.io",
            "https://api.nuget.org/v3/index.json",
            "https://github.com",
            "https://gitlab.com"
          ],
          "format": "uri",
          "type": "string"
        },
        "registryType": {
          "description": "Registry type indicating how to download packages (e.g., 'npm', 'pypi', 'oci', 'nuget', 'mcpb')",
          "examples": [
            "npm",
            "pypi",
            "oci",
            "nuget",
            "mcpb"
          ],
          "type": "string"
        },
        "runtimeArguments": {
          "description": "A list of arguments to be passed to the package's runtime command (such as docker or npx). The \`runtimeHint\` field should be provided when \`runtimeArguments\` are present.",
          "items": {
            "$ref": "#/definitions/Argument"
          },
          "type": "array"
        },
        "runtimeHint": {
          "description": "A hint to help clients determine the appropriate runtime for the package. This field should be provided when \`runtimeArguments\` are present.",
          "examples": [
            "npx",
            "uvx",
            "docker",
            "dnx"
          ],
          "type": "string"
        },
        "transport": {
          "$ref": "#/definitions/LocalTransport",
          "description": "Transport protocol configuration for the package"
        },
        "version": {
          "description": "Package version. Must be a specific version. Version ranges are rejected (e.g., '^1.2.3', '~1.2.3', '\\u003e=1.2.3', '1.x', '1.*').",
          "example": "1.0.2",
          "minLength": 1,
          "not": {
            "const": "latest"
          },
          "type": "string"
        }
      },
      "required": [
        "registryType",
        "identifier",
        "transport"
      ],
      "type": "object"
    },
    "PositionalArgument": {
      "allOf": [
        {
          "$ref": "#/definitions/InputWithVariables"
        },
        {
          "anyOf": [
            {
              "required": [
                "valueHint"
              ]
            },
            {
              "required": [
                "value"
              ]
            }
          ],
          "properties": {
            "isRepeated": {
              "default": false,
              "description": "Whether the argument can be repeated multiple times in the command line.",
              "type": "boolean"
            },
            "type": {
              "enum": [
                "positional"
              ],
              "example": "positional",
              "type": "string"
            },
            "valueHint": {
              "description": "An identifier for the positional argument. It is not part of the command line. It may be used by client configuration as a label identifying the argument. It is also used to identify the value in transport URL variable substitution.",
              "example": "file_path",
              "type": "string"
            }
          },
          "required": [
            "type"
          ],
          "type": "object"
        }
      ],
      "description": "A positional input is a value inserted verbatim into the command line."
    },
    "RemoteTransport": {
      "allOf": [
        {
          "anyOf": [
            {
              "$ref": "#/definitions/StreamableHttpTransport"
            },
            {
              "$ref": "#/definitions/SseTransport"
            }
          ]
        },
        {
          "properties": {
            "variables": {
              "additionalProperties": {
                "$ref": "#/definitions/Input"
              },
              "description": "Configuration variables that can be referenced in URL template {curly_braces}. The key is the variable name, and the value defines the variable properties.",
              "type": "object"
            }
          },
          "type": "object"
        }
      ],
      "description": "Transport protocol configuration for remote context - extends StreamableHttpTransport or SseTransport with variables"
    },
    "Repository": {
      "description": "Repository metadata for the MCP server source code. Enables users and security experts to inspect the code, improving transparency.",
      "properties": {
        "id": {
          "description": "Repository identifier from the hosting service (e.g., GitHub repo ID). Owned and determined by the source forge. Should remain stable across repository renames and may be used to detect repository resurrection attacks - if a repository is deleted and recreated, the ID should change. For GitHub, use: gh api repos/\\u003cowner\\u003e/\\u003crepo\\u003e --jq '.id'",
          "example": "b94b5f7e-c7c6-d760-2c78-a5e9b8a5b8c9",
          "type": "string"
        },
        "source": {
          "description": "Repository hosting service identifier. Used by registries to determine validation and API access methods.",
          "example": "github",
          "type": "string"
        },
        "subfolder": {
          "description": "Optional relative path from repository root to the server location within a monorepo or nested package structure. Must be a clean relative path.",
          "example": "src/everything",
          "type": "string"
        },
        "url": {
          "description": "Repository URL for browsing source code. Should support both web browsing and git clone operations.",
          "example": "https://github.com/modelcontextprotocol/servers",
          "format": "uri",
          "type": "string"
        }
      },
      "required": [
        "url",
        "source"
      ],
      "type": "object"
    },
    "ServerDetail": {
      "description": "Schema for a static representation of an MCP server. Used in various contexts related to discovery, installation, and configuration.",
      "properties": {
        "$schema": {
          "description": "JSON Schema URI for this server.json format",
          "example": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
          "format": "uri",
          "type": "string"
        },
        "_meta": {
          "description": "Extension metadata using reverse DNS namespacing for vendor-specific data",
          "properties": {
            "io.modelcontextprotocol.registry/publisher-provided": {
              "additionalProperties": true,
              "description": "Publisher-provided metadata for downstream registries",
              "example": {
                "buildInfo": {
                  "commit": "abc123def456",
                  "pipelineId": "build-789",
                  "timestamp": "2023-12-01T10:30:00Z"
                },
                "tool": "publisher-cli",
                "version": "1.2.3"
              },
              "type": "object"
            }
          },
          "type": "object"
        },
        "description": {
          "description": "Clear human-readable explanation of server functionality. Should focus on capabilities, not implementation details.",
          "example": "MCP server providing weather data and forecasts via OpenWeatherMap API",
          "maxLength": 100,
          "minLength": 1,
          "type": "string"
        },
        "icons": {
          "description": "Optional set of sized icons that the client can display in a user interface. Clients that support rendering icons MUST support at least the following MIME types: image/png and image/jpeg (safe, universal compatibility). Clients SHOULD also support: image/svg+xml (scalable but requires security precautions) and image/webp (modern, efficient format).",
          "items": {
            "$ref": "#/definitions/Icon"
          },
          "type": "array"
        },
        "name": {
          "description": "Server name in reverse-DNS format. Must contain exactly one forward slash separating namespace from server name.",
          "example": "io.github.user/weather",
          "maxLength": 200,
          "minLength": 3,
          "pattern": "^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$",
          "type": "string"
        },
        "packages": {
          "items": {
            "$ref": "#/definitions/Package"
          },
          "type": "array"
        },
        "remotes": {
          "items": {
            "$ref": "#/definitions/RemoteTransport"
          },
          "type": "array"
        },
        "repository": {
          "$ref": "#/definitions/Repository",
          "description": "Optional repository metadata for the MCP server source code. Recommended for transparency and security inspection."
        },
        "title": {
          "description": "Optional human-readable title or display name for the MCP server. MCP subregistries or clients MAY choose to use this for display purposes.",
          "example": "Weather API",
          "maxLength": 100,
          "minLength": 1,
          "type": "string"
        },
        "version": {
          "description": "Version string for this server. SHOULD follow semantic versioning (e.g., '1.0.2', '2.1.0-alpha'). Equivalent of Implementation.version in MCP specification. Non-semantic versions are allowed but may not sort predictably. Version ranges are rejected (e.g., '^1.2.3', '~1.2.3', '\\u003e=1.2.3', '1.x', '1.*').",
          "example": "1.0.2",
          "maxLength": 255,
          "type": "string"
        },
        "websiteUrl": {
          "description": "Optional URL to the server's homepage, documentation, or project website. This provides a central link for users to learn more about the server. Particularly useful when the server has custom installation instructions or setup requirements.",
          "example": "https://modelcontextprotocol.io/examples",
          "format": "uri",
          "type": "string"
        }
      },
      "required": [
        "name",
        "description",
        "version"
      ],
      "type": "object"
    },
    "SseTransport": {
      "properties": {
        "headers": {
          "description": "HTTP headers to include",
          "items": {
            "$ref": "#/definitions/KeyValueInput"
          },
          "type": "array"
        },
        "type": {
          "description": "Transport type",
          "enum": [
            "sse"
          ],
          "example": "sse",
          "type": "string"
        },
        "url": {
          "description": "Server-Sent Events endpoint URL template. Variables in {curly_braces} are resolved based on context: In Package context, they reference argument valueHints, argument names, or environment variable names from the parent Package. In Remote context, they reference variables from the transport's 'variables' object. After variable substitution, this should produce a valid URI.",
          "example": "https://mcp-fs.example.com/sse",
          "pattern": "^https?://[^\\\\s]+$",
          "type": "string"
        }
      },
      "required": [
        "type",
        "url"
      ],
      "type": "object"
    },
    "StdioTransport": {
      "properties": {
        "type": {
          "description": "Transport type",
          "enum": [
            "stdio"
          ],
          "example": "stdio",
          "type": "string"
        }
      },
      "required": [
        "type"
      ],
      "type": "object"
    },
    "StreamableHttpTransport": {
      "properties": {
        "headers": {
          "description": "HTTP headers to include",
          "items": {
            "$ref": "#/definitions/KeyValueInput"
          },
          "type": "array"
        },
        "type": {
          "description": "Transport type",
          "enum": [
            "streamable-http"
          ],
          "example": "streamable-http",
          "type": "string"
        },
        "url": {
          "description": "URL template for the streamable-http transport. Variables in {curly_braces} are resolved based on context: In Package context, they reference argument valueHints, argument names, or environment variable names from the parent Package. In Remote context, they reference variables from the transport's 'variables' object. After variable substitution, this should produce a valid URI.",
          "example": "https://api.example.com/mcp",
          "pattern": "^https?://[^\\\\s]+$",
          "type": "string"
        }
      },
      "required": [
        "type",
        "url"
      ],
      "type": "object"
    }
  },
  "title": "server.json defining a Model Context Protocol (MCP) server"
}
`),M=JSON.parse(`{
  "$comment": "This file is auto-generated from docs/reference/api/openapi.yaml. Do not edit manually. Run 'make generate-schema' to update.",
  "$id": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "$ref": "#/definitions/ServerDetail",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "Argument": {
      "anyOf": [
        {
          "$ref": "#/definitions/PositionalArgument"
        },
        {
          "$ref": "#/definitions/NamedArgument"
        }
      ],
      "description": "Warning: Arguments construct command-line parameters that may contain user-provided input. This creates potential command injection risks if clients execute commands in a shell environment. For example, a malicious argument value like ';rm -rf ~/Development' could execute dangerous commands. Clients should prefer non-shell execution methods (e.g., posix_spawn) when possible to eliminate injection risks entirely. Where not possible, clients should obtain consent from users or agents to run the resolved command before execution."
    },
    "Icon": {
      "description": "An optionally-sized icon that can be displayed in a user interface.",
      "properties": {
        "mimeType": {
          "description": "Optional MIME type override if the source MIME type is missing or generic. Must be one of: image/png, image/jpeg, image/jpg, image/svg+xml, image/webp.",
          "enum": [
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/svg+xml",
            "image/webp"
          ],
          "example": "image/png",
          "type": "string"
        },
        "sizes": {
          "description": "Optional array of strings that specify sizes at which the icon can be used. Each string should be in WxH format (e.g., '48x48', '96x96') or 'any' for scalable formats like SVG. If not provided, the client should assume that the icon can be used at any size.",
          "examples": [
            [
              "48x48",
              "96x96"
            ],
            [
              "any"
            ]
          ],
          "items": {
            "pattern": "^(\\\\d+x\\\\d+|any)$",
            "type": "string"
          },
          "type": "array"
        },
        "src": {
          "description": "A standard URI pointing to an icon resource. Must be an HTTPS URL. Consumers SHOULD take steps to ensure URLs serving icons are from the same domain as the server or a trusted domain. Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain executable JavaScript.",
          "example": "https://example.com/icon.png",
          "format": "uri",
          "maxLength": 255,
          "type": "string"
        },
        "theme": {
          "description": "Optional specifier for the theme this icon is designed for. 'light' indicates the icon is designed to be used with a light background, and 'dark' indicates the icon is designed to be used with a dark background. If not provided, the client should assume the icon can be used with any theme.",
          "enum": [
            "light",
            "dark"
          ],
          "type": "string"
        }
      },
      "required": [
        "src"
      ],
      "type": "object"
    },
    "Input": {
      "properties": {
        "choices": {
          "description": "A list of possible values for the input. If provided, the user must select one of these values.",
          "example": [],
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "default": {
          "description": "The default value for the input.  This should be a valid value for the input.  If you want to provide input examples or guidance, use the \`placeholder\` field instead.",
          "type": "string"
        },
        "description": {
          "description": "A description of the input, which clients can use to provide context to the user.",
          "type": "string"
        },
        "format": {
          "default": "string",
          "description": "Specifies the input format. Supported values include \`filepath\`, which should be interpreted as a file on the user's filesystem.\\n\\nWhen the input is converted to a string, booleans should be represented by the strings \\"true\\" and \\"false\\", and numbers should be represented as decimal values.",
          "enum": [
            "string",
            "number",
            "boolean",
            "filepath"
          ],
          "type": "string"
        },
        "isRequired": {
          "default": false,
          "type": "boolean"
        },
        "isSecret": {
          "default": false,
          "description": "Indicates whether the input is a secret value (e.g., password, token). If true, clients should handle the value securely.",
          "type": "boolean"
        },
        "placeholder": {
          "description": "A placeholder for the input to be displaying during configuration. This is used to provide examples or guidance about the expected form or content of the input.",
          "type": "string"
        },
        "value": {
          "description": "The value for the input. If this is not set, the user may be prompted to provide a value. If a value is set, it should not be configurable by end users.\\n\\nIdentifiers wrapped in \`{curly_braces}\` will be replaced with the corresponding properties from the input \`variables\` map. If an identifier in braces is not found in \`variables\`, or if \`variables\` is not provided, the \`{curly_braces}\` substring should remain unchanged.\\n",
          "type": "string"
        }
      },
      "type": "object"
    },
    "InputWithVariables": {
      "allOf": [
        {
          "$ref": "#/definitions/Input"
        },
        {
          "properties": {
            "variables": {
              "additionalProperties": {
                "$ref": "#/definitions/Input"
              },
              "description": "A map of variable names to their values. Keys in the input \`value\` that are wrapped in \`{curly_braces}\` will be replaced with the corresponding variable values.",
              "type": "object"
            }
          },
          "type": "object"
        }
      ]
    },
    "KeyValueInput": {
      "allOf": [
        {
          "$ref": "#/definitions/InputWithVariables"
        },
        {
          "properties": {
            "name": {
              "description": "Name of the header or environment variable.",
              "example": "SOME_VARIABLE",
              "type": "string"
            }
          },
          "required": [
            "name"
          ],
          "type": "object"
        }
      ]
    },
    "LocalTransport": {
      "anyOf": [
        {
          "$ref": "#/definitions/StdioTransport"
        },
        {
          "$ref": "#/definitions/StreamableHttpTransport"
        },
        {
          "$ref": "#/definitions/SseTransport"
        }
      ],
      "description": "Transport protocol configuration for local/package context"
    },
    "NamedArgument": {
      "allOf": [
        {
          "$ref": "#/definitions/InputWithVariables"
        },
        {
          "properties": {
            "isRepeated": {
              "default": false,
              "description": "Whether the argument can be repeated multiple times.",
              "type": "boolean"
            },
            "name": {
              "description": "The flag name, including any leading dashes.",
              "example": "--port",
              "type": "string"
            },
            "type": {
              "enum": [
                "named"
              ],
              "example": "named",
              "type": "string"
            }
          },
          "required": [
            "type",
            "name"
          ],
          "type": "object"
        }
      ],
      "description": "A command-line \`--flag={value}\`."
    },
    "Package": {
      "properties": {
        "environmentVariables": {
          "description": "A mapping of environment variables to be set when running the package.",
          "items": {
            "$ref": "#/definitions/KeyValueInput"
          },
          "type": "array"
        },
        "fileSha256": {
          "description": "SHA-256 hash of the package file for integrity verification. Required for MCPB packages and optional for other package types. Authors are responsible for generating correct SHA-256 hashes when creating server.json. If present, MCP clients must validate the downloaded file matches the hash before running packages to ensure file integrity.",
          "example": "fe333e598595000ae021bd27117db32ec69af6987f507ba7a63c90638ff633ce",
          "pattern": "^[a-f0-9]{64}$",
          "type": "string"
        },
        "identifier": {
          "description": "Package identifier - either a package name (for registries) or URL (for direct downloads)",
          "examples": [
            "@modelcontextprotocol/server-brave-search",
            "https://github.com/example/releases/download/v1.0.0/package.mcpb"
          ],
          "type": "string"
        },
        "packageArguments": {
          "description": "A list of arguments to be passed to the package's binary.",
          "items": {
            "$ref": "#/definitions/Argument"
          },
          "type": "array"
        },
        "registryBaseUrl": {
          "description": "Base URL of the package registry",
          "examples": [
            "https://registry.npmjs.org",
            "https://pypi.org",
            "https://docker.io",
            "https://api.nuget.org/v3/index.json",
            "https://github.com",
            "https://gitlab.com"
          ],
          "format": "uri",
          "type": "string"
        },
        "registryType": {
          "description": "Registry type indicating how to download packages (e.g., 'npm', 'pypi', 'oci', 'nuget', 'mcpb')",
          "examples": [
            "npm",
            "pypi",
            "oci",
            "nuget",
            "mcpb"
          ],
          "type": "string"
        },
        "runtimeArguments": {
          "description": "A list of arguments to be passed to the package's runtime command (such as docker or npx). The \`runtimeHint\` field should be provided when \`runtimeArguments\` are present.",
          "items": {
            "$ref": "#/definitions/Argument"
          },
          "type": "array"
        },
        "runtimeHint": {
          "description": "A hint to help clients determine the appropriate runtime for the package. This field should be provided when \`runtimeArguments\` are present.",
          "examples": [
            "npx",
            "uvx",
            "docker",
            "dnx"
          ],
          "type": "string"
        },
        "transport": {
          "$ref": "#/definitions/LocalTransport",
          "description": "Transport protocol configuration for the package"
        },
        "version": {
          "description": "Package version. Must be a specific version. Version ranges are rejected (e.g., '^1.2.3', '~1.2.3', '\\u003e=1.2.3', '1.x', '1.*').",
          "example": "1.0.2",
          "minLength": 1,
          "not": {
            "const": "latest"
          },
          "type": "string"
        }
      },
      "required": [
        "registryType",
        "identifier",
        "transport"
      ],
      "type": "object"
    },
    "PositionalArgument": {
      "allOf": [
        {
          "$ref": "#/definitions/InputWithVariables"
        },
        {
          "anyOf": [
            {
              "required": [
                "valueHint"
              ]
            },
            {
              "required": [
                "value"
              ]
            }
          ],
          "properties": {
            "isRepeated": {
              "default": false,
              "description": "Whether the argument can be repeated multiple times in the command line.",
              "type": "boolean"
            },
            "type": {
              "enum": [
                "positional"
              ],
              "example": "positional",
              "type": "string"
            },
            "valueHint": {
              "description": "An identifier for the positional argument. It is not part of the command line. It may be used by client configuration as a label identifying the argument. It is also used to identify the value in transport URL variable substitution.",
              "example": "file_path",
              "type": "string"
            }
          },
          "required": [
            "type"
          ],
          "type": "object"
        }
      ],
      "description": "A positional input is a value inserted verbatim into the command line."
    },
    "RemoteTransport": {
      "allOf": [
        {
          "anyOf": [
            {
              "$ref": "#/definitions/StreamableHttpTransport"
            },
            {
              "$ref": "#/definitions/SseTransport"
            }
          ]
        },
        {
          "properties": {
            "variables": {
              "additionalProperties": {
                "$ref": "#/definitions/Input"
              },
              "description": "Configuration variables that can be referenced in URL template {curly_braces}. The key is the variable name, and the value defines the variable properties.",
              "type": "object"
            }
          },
          "type": "object"
        }
      ],
      "description": "Transport protocol configuration for remote context - extends StreamableHttpTransport or SseTransport with variables"
    },
    "Repository": {
      "description": "Repository metadata for the MCP server source code. Enables users and security experts to inspect the code, improving transparency.",
      "properties": {
        "id": {
          "description": "Repository identifier from the hosting service (e.g., GitHub repo ID). Owned and determined by the source forge. Should remain stable across repository renames and may be used to detect repository resurrection attacks - if a repository is deleted and recreated, the ID should change. For GitHub, use: gh api repos/\\u003cowner\\u003e/\\u003crepo\\u003e --jq '.id'",
          "example": "b94b5f7e-c7c6-d760-2c78-a5e9b8a5b8c9",
          "type": "string"
        },
        "source": {
          "description": "Repository hosting service identifier. Used by registries to determine validation and API access methods.",
          "example": "github",
          "type": "string"
        },
        "subfolder": {
          "description": "Optional relative path from repository root to the server location within a monorepo or nested package structure. Must be a clean relative path.",
          "example": "src/everything",
          "type": "string"
        },
        "url": {
          "description": "Repository URL for browsing source code. Should support both web browsing and git clone operations.",
          "example": "https://github.com/modelcontextprotocol/servers",
          "format": "uri",
          "type": "string"
        }
      },
      "required": [
        "url",
        "source"
      ],
      "type": "object"
    },
    "ServerDetail": {
      "description": "Schema for a static representation of an MCP server. Used in various contexts related to discovery, installation, and configuration.",
      "properties": {
        "$schema": {
          "description": "JSON Schema URI for this server.json format",
          "example": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
          "format": "uri",
          "type": "string"
        },
        "_meta": {
          "description": "Extension metadata using reverse DNS namespacing for vendor-specific data",
          "properties": {
            "io.modelcontextprotocol.registry/publisher-provided": {
              "additionalProperties": true,
              "description": "Publisher-provided metadata for downstream registries",
              "example": {
                "buildInfo": {
                  "commit": "abc123def456",
                  "pipelineId": "build-789",
                  "timestamp": "2023-12-01T10:30:00Z"
                },
                "tool": "publisher-cli",
                "version": "1.2.3"
              },
              "type": "object"
            }
          },
          "type": "object"
        },
        "description": {
          "description": "Clear human-readable explanation of server functionality. Should focus on capabilities, not implementation details.",
          "example": "MCP server providing weather data and forecasts via OpenWeatherMap API",
          "maxLength": 100,
          "minLength": 1,
          "type": "string"
        },
        "icons": {
          "description": "Optional set of sized icons that the client can display in a user interface. Clients that support rendering icons MUST support at least the following MIME types: image/png and image/jpeg (safe, universal compatibility). Clients SHOULD also support: image/svg+xml (scalable but requires security precautions) and image/webp (modern, efficient format).",
          "items": {
            "$ref": "#/definitions/Icon"
          },
          "type": "array"
        },
        "name": {
          "description": "Server name in reverse-DNS format. Must contain exactly one forward slash separating namespace from server name.",
          "example": "io.github.user/weather",
          "maxLength": 200,
          "minLength": 3,
          "pattern": "^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$",
          "type": "string"
        },
        "packages": {
          "items": {
            "$ref": "#/definitions/Package"
          },
          "type": "array"
        },
        "remotes": {
          "items": {
            "$ref": "#/definitions/RemoteTransport"
          },
          "type": "array"
        },
        "repository": {
          "$ref": "#/definitions/Repository",
          "description": "Optional repository metadata for the MCP server source code. Recommended for transparency and security inspection."
        },
        "title": {
          "description": "Optional human-readable title or display name for the MCP server. MCP subregistries or clients MAY choose to use this for display purposes.",
          "example": "Weather API",
          "maxLength": 100,
          "minLength": 1,
          "type": "string"
        },
        "version": {
          "description": "Version string for this server. SHOULD follow semantic versioning (e.g., '1.0.2', '2.1.0-alpha'). Equivalent of Implementation.version in MCP specification. Non-semantic versions are allowed but may not sort predictably. Version ranges are rejected (e.g., '^1.2.3', '~1.2.3', '\\u003e=1.2.3', '1.x', '1.*').",
          "example": "1.0.2",
          "maxLength": 255,
          "type": "string"
        },
        "websiteUrl": {
          "description": "Optional URL to the server's homepage, documentation, or project website. This provides a central link for users to learn more about the server. Particularly useful when the server has custom installation instructions or setup requirements.",
          "example": "https://modelcontextprotocol.io/examples",
          "format": "uri",
          "type": "string"
        }
      },
      "required": [
        "name",
        "description",
        "version"
      ],
      "type": "object"
    },
    "SseTransport": {
      "properties": {
        "headers": {
          "description": "HTTP headers to include",
          "items": {
            "$ref": "#/definitions/KeyValueInput"
          },
          "type": "array"
        },
        "type": {
          "description": "Transport type",
          "enum": [
            "sse"
          ],
          "example": "sse",
          "type": "string"
        },
        "url": {
          "description": "Server-Sent Events endpoint URL template. Variables in {curly_braces} are resolved based on context: In Package context, they reference argument valueHints, argument names, or environment variable names from the parent Package. In Remote context, they reference variables from the transport's 'variables' object. After variable substitution, this should produce a valid URI.",
          "example": "https://mcp-fs.example.com/sse",
          "pattern": "^https?://[^\\\\s]+$",
          "type": "string"
        }
      },
      "required": [
        "type",
        "url"
      ],
      "type": "object"
    },
    "StdioTransport": {
      "properties": {
        "type": {
          "description": "Transport type",
          "enum": [
            "stdio"
          ],
          "example": "stdio",
          "type": "string"
        }
      },
      "required": [
        "type"
      ],
      "type": "object"
    },
    "StreamableHttpTransport": {
      "properties": {
        "headers": {
          "description": "HTTP headers to include",
          "items": {
            "$ref": "#/definitions/KeyValueInput"
          },
          "type": "array"
        },
        "type": {
          "description": "Transport type",
          "enum": [
            "streamable-http"
          ],
          "example": "streamable-http",
          "type": "string"
        },
        "url": {
          "description": "URL template for the streamable-http transport. Variables in {curly_braces} are resolved based on context: In Package context, they reference argument valueHints, argument names, or environment variable names from the parent Package. In Remote context, they reference variables from the transport's 'variables' object. After variable substitution, this should produce a valid URI.",
          "example": "https://api.example.com/mcp",
          "pattern": "^https?://[^\\\\s]+$",
          "type": "string"
        }
      },
      "required": [
        "type",
        "url"
      ],
      "type": "object"
    }
  },
  "title": "server.json defining a Model Context Protocol (MCP) server"
}
`);import{createHash as Y}from"node:crypto";function L(o){let n=(e)=>{if(e===null||typeof e==="string"||typeof e==="boolean")return e;if(typeof e==="number"){if(!Number.isFinite(e))throw TypeError("canonical JSON rejects non-finite numbers");return Object.is(e,-0)?0:e}if(Array.isArray(e))return e.map(n);if(typeof e==="object"){let i=e;return Object.fromEntries(Object.keys(i).sort().map((s)=>{if(i[s]===void 0)throw TypeError("canonical JSON rejects undefined");return[s,n(i[s])]}))}throw TypeError(`canonical JSON rejects ${typeof e}`)};return JSON.stringify(n(o))}function R(o){return Y("sha256").update(o).digest("hex")}var S=new Set(["plugin","skill","mcp-server"]),C=/^[0-9a-f]{64}$/,G=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/,U=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,v=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,F=/^[0-9A-Za-z][0-9A-Za-z._+-]{0,254}$/,Q=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,q=/^[A-Za-z0-9._-]+$/,A=/^(darwin|linux|win32)-(arm64|x64)$/,W=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i,E=new D({strict:!0,strictRequired:!1,allErrors:!1,coerceTypes:!1,useDefaults:!1,removeAdditional:!1,validateFormats:!1});E.addKeyword({keyword:"example",valid:!0});var P=E.compile(M);function c(o,n){if(o===null||typeof o!=="object"||Array.isArray(o))throw TypeError(`${n} must be an object`);return o}function m(o,n,e,i){for(let s of Object.keys(o))if(!n.includes(s))throw TypeError(`${i} has unknown property ${s}`);for(let s of e)if(!(s in o))throw TypeError(`${i} is missing ${s}`)}function u(o,n,e=4096){if(typeof o!=="string"||o.length===0||o.length>e)throw TypeError(`${n} must be a non-empty string of at most ${e} characters`);return o}function $(o,n,e=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(o)||o<0||o>e)throw TypeError(`${n} must be a non-negative safe integer`);return o}function w(o,n){let e=u(o,n,64);if(!C.test(e))throw TypeError(`${n} must be a lowercase SHA-256 digest`);return e}function H(o){return R(new TextEncoder().encode(`${L(o)}
`))}function O(o,n){let e=new URL(u(o,n));if(e.protocol!=="https:"||e.username||e.password||e.search||e.hash)throw TypeError(`${n} must be an HTTPS URL without credentials, query, or fragment`);return e.toString()}function _(o,n){let e=new URL(O(o,n)),i=e.pathname.split("/").filter(Boolean);if(e.hostname.toLowerCase()!=="github.com"||e.port!==""||i.length!==6||e.pathname!==`/${i.join("/")}`||i[2]!=="releases"||i[3]!=="download"||i[4]?.toLowerCase()==="latest"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(i[4]??"")||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(i[5]??""))throw TypeError(`${n} must be an immutable GitHub Release asset URL`);return e.toString()}function B(o){let n=c(o,"compatibility");return m(n,["convax"],["convax"],"compatibility"),{convax:u(n.convax,"compatibility.convax",128)}}function J(o){let n=c(o,"presentation");return m(n,["name","description"],["name"],"presentation"),{name:u(n.name,"presentation.name",100),...n.description===void 0?{}:{description:u(n.description,"presentation.description",1024)}}}function N(o){let n=c(o,"artifact delivery");if(m(n,["kind","url","size","sha256"],["kind","url","size","sha256"],"artifact delivery"),n.kind!=="artifact")throw TypeError("artifact delivery kind must be artifact");let e=$(n.size,"artifact size",134217728);if(e<1)throw TypeError("artifact size must be positive");return{kind:"artifact",url:_(n.url,"artifact URL"),size:e,sha256:w(n.sha256,"artifact sha256")}}function hn(o){let n=c(o,"marketplace descriptor");if(m(n,["schema","id","name","publisher","repository","registry","showcase","compatibility","delivery"],["schema","id","name","publisher","repository","registry","showcase","compatibility","delivery"],"marketplace descriptor"),n.schema!=="convax.marketplace/1")throw TypeError("unsupported marketplace descriptor schema");let e=u(n.id,"marketplace id",63);if(!U.test(e))throw TypeError("invalid marketplace id");let i=c(n.publisher,"publisher");m(i,["name"],["name"],"publisher");let s=c(n.repository,"repository");m(s,["owner","name"],["owner","name"],"repository");let f=c(n.registry,"registry");m(f,["v2"],["v2"],"registry");let a=c(f.v2,"registry.v2");m(a,["url"],["url"],"registry.v2");let y=c(n.showcase,"showcase");m(y,["v2"],["v2"],"showcase");let h=c(y.v2,"showcase.v2");m(h,["url"],["url"],"showcase.v2");let t=c(n.delivery,"delivery");if(m(t,["kind"],["kind"],"delivery"),t.kind!=="github-pages-releases")throw TypeError("unsupported delivery policy");let g=u(s.owner,"repository owner",100),r=u(s.name,"repository name",100);if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(g)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(r)||r==="."||r==="..")throw TypeError("repository owner/name must be valid GitHub repository path segments");let p=(d,T)=>{let b=new URL(O(d,T)),x=`${g.toLowerCase()}.github.io`,l=b.pathname.split("/").filter(Boolean);if(b.hostname.toLowerCase()!==x||b.port!==""||!b.pathname.startsWith(`/${r}/`)||b.pathname!==`/${l.join("/")}`||l.some((j)=>!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(j))||b.search)throw TypeError(`${T} must use the declared repository GitHub Pages origin`);return b.toString()};return{schema:"convax.marketplace/1",id:e,name:u(n.name,"marketplace name",100),publisher:{name:u(i.name,"publisher name",100)},repository:{owner:g,name:r},registry:{v2:{url:p(a.url,"registry.v2.url")}},showcase:{v2:{url:p(h.url,"showcase.v2.url")}},compatibility:B(n.compatibility),delivery:{kind:"github-pages-releases"}}}function X(o){let n=c(o,"MCP extension");if(m(n,["schema","runtime","productActions","grants"],["schema","runtime"],"MCP extension"),n.schema!=="convax.mcp-server-extension/1")throw TypeError("unsupported MCP extension schema");let e=c(n.runtime,"MCP runtime");if(m(e,["kind","command","argv","compatibility"],["kind","command","argv","compatibility"],"MCP runtime"),e.kind!=="managed-stdio")throw TypeError("MCP extension must use managed-stdio");let i=u(e.command,"MCP command",128);if(!q.test(i)||W.test(i))throw TypeError("invalid bare MCP command");if(!Array.isArray(e.argv)||e.argv.length>32)throw TypeError("MCP argv must be a bounded array");let s=e.argv.map((r,p)=>{let d=u(r,`MCP argv[${p}]`,1024);if(d.includes("\x00"))throw TypeError("MCP argv cannot contain NUL");return d}),f=c(e.compatibility,"MCP runtime compatibility");if(m(f,["targets"],["targets"],"MCP runtime compatibility"),!Array.isArray(f.targets)||f.targets.length===0||f.targets.length>8)throw TypeError("MCP runtime must declare bounded targets");let a=f.targets.map((r)=>u(r,"MCP target",32));if(new Set(a).size!==a.length||a.some((r)=>!A.test(r)))throw TypeError("invalid or duplicate MCP target");let y=new Set(["canvas.import","canvas.export","project.files.read"]),h=n.productActions===void 0?void 0:(()=>{if(!Array.isArray(n.productActions)||n.productActions.length>32)throw TypeError("MCP product actions must be bounded");return n.productActions.map((r)=>{let p=c(r,"MCP product action");m(p,["action","tool"],["action","tool"],"MCP product action");let d=u(p.action,"MCP product action name",64);if(!y.has(d))throw TypeError("unsupported MCP product action");return{action:d,tool:u(p.tool,"MCP product tool",128)}})})(),t=new Set(["canvas.read","canvas.write","project.files.read"]),g=n.grants===void 0?void 0:(()=>{if(!Array.isArray(n.grants)||n.grants.length>16)throw TypeError("MCP grants must be bounded");return n.grants.map((r)=>{let p=u(r,"MCP grant",64);if(!t.has(p))throw TypeError("unsupported MCP grant");return p})})();return{schema:"convax.mcp-server-extension/1",runtime:{kind:"managed-stdio",command:i,argv:s,compatibility:{targets:a}},...h?{productActions:h}:{},...g?{grants:g}:{}}}function z(o,n){let e=c(o,"delivery");if(e.kind==="artifact"){if(n==="mcp-server")throw TypeError("MCP Server cannot use a static artifact delivery");return N(e)}if(n!=="mcp-server")throw TypeError("only MCP Server may use MCP delivery");if(e.kind==="mcp-http"){m(e,["kind","serverJson","serverJsonSha256","runtime"],["kind","serverJson","serverJsonSha256","runtime"],"MCP HTTP delivery");let i=c(e.serverJson,"serverJson"),s=k(i);if(s.runtime.kind!=="http-agent")throw TypeError("MCP HTTP delivery must contain HTTP definition");let f=c(e.runtime,"MCP HTTP runtime");if(m(f,["endpoint","transport"],["endpoint","transport"],"MCP HTTP runtime"),f.endpoint!==s.runtime.endpoint||f.transport!==s.runtime.transport)throw TypeError("MCP HTTP runtime does not match server.json");let a=w(e.serverJsonSha256,"serverJsonSha256");if(a!==H(i))throw TypeError("serverJsonSha256 does not match canonical server.json bytes");return{kind:"mcp-http",serverJson:i,serverJsonSha256:a,runtime:{endpoint:s.runtime.endpoint,transport:s.runtime.transport}}}if(e.kind==="mcp-managed-stdio"){m(e,["kind","serverJson","serverJsonSha256","extension","extensionSha256","companions"],["kind","serverJson","serverJsonSha256","extension","extensionSha256","companions"],"managed MCP delivery");let i=c(e.serverJson,"serverJson"),s=X(e.extension);if(k(i,s),!Array.isArray(e.companions)||e.companions.length===0||e.companions.length>8)throw TypeError("managed MCP delivery must contain bounded companions");let f=e.companions.map((h)=>{let t=c(h,"companion");m(t,["target","command","url","size","sha256"],["target","command","url","size","sha256"],"companion");let g=u(t.target,"companion target",32);if(!A.test(g))throw TypeError("invalid companion target");let r=u(t.command,"companion command",128);if(r!==s.runtime.command)throw TypeError("companion command does not match extension");let p=$(t.size,"companion size",134217728);if(p<1)throw TypeError("companion size must be positive");return{target:g,command:r,url:_(t.url,"companion URL"),size:p,sha256:w(t.sha256,"companion sha256")}});if(new Set(f.map(({target:h})=>h)).size!==f.length)throw TypeError("duplicate companion target");if(f.some(({target:h})=>!s.runtime.compatibility.targets.includes(h)))throw TypeError("companion target is outside extension compatibility");let a=w(e.serverJsonSha256,"serverJsonSha256");if(a!==H(i))throw TypeError("serverJsonSha256 does not match canonical server.json bytes");let y=w(e.extensionSha256,"extensionSha256");if(y!==H(s))throw TypeError("extensionSha256 does not match canonical extension bytes");return{kind:"mcp-managed-stdio",serverJson:i,serverJsonSha256:a,extension:s,extensionSha256:y,companions:f}}throw TypeError("unsupported delivery kind")}function V(o){let n=c(o,"registry package");if(m(n,["kind","id","version","compatibility","presentation","delivery","yanked","manifest","companions","ownerPluginId"],["kind","id","version","compatibility","presentation","delivery"],"registry package"),!S.has(n.kind))throw TypeError("unsupported package kind");let e=n.kind,i=u(n.id,"package id",200);if(!G.test(i))throw TypeError("invalid package id");let s=u(n.version,"package version",255);if(e==="mcp-server"?!F.test(s):!v.test(s))throw TypeError(`${e} version is unsafe or unsupported`);let f=z(n.delivery,e);if(n.yanked!==void 0&&typeof n.yanked!=="boolean")throw TypeError("yanked must be boolean");if(e==="plugin"&&n.manifest===void 0)throw TypeError("Plugin Registry package must project its manifest");if(e==="plugin"){let y=c(n.manifest,"Plugin manifest projection");if(y.schema!=="convax.plugin/8"||y.id!==i||y.version!==s){if(y.id!==i||y.version!==s)throw TypeError("Plugin manifest identity must match its Registry entry");throw TypeError("Plugin manifest schema is unsupported")}let h=c(y.hostApi,"Plugin manifest hostApi");m(h,["major","required","optional"],["major","required","optional"],"Plugin manifest hostApi");let t=/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;if(h.major!==1||!Array.isArray(h.required)||!Array.isArray(h.optional)||[...h.required,...h.optional].some((p)=>typeof p!=="string"||!t.test(p)))throw TypeError("Plugin manifest hostApi declaration is invalid");let{required:g,optional:r}=h;if(new Set(g).size!==g.length||new Set(r).size!==r.length||r.some((p)=>g.includes(p)))throw TypeError("Plugin manifest hostApi declaration contains duplicate or overlapping APIs")}if(e!=="plugin"&&n.manifest!==void 0)throw TypeError("only Plugin may project a manifest");let a=n.companions===void 0?void 0:(()=>{if(e!=="plugin"||!Array.isArray(n.companions)||n.companions.length===0||n.companions.length>16)throw TypeError("Plugin companions must be a bounded array");let y=n.companions.map((h)=>{let t=c(h,"Plugin companion");m(t,["command","version","targets"],["command","version","targets"],"Plugin companion");let g=u(t.command,"Plugin companion command",128);if(!q.test(g)||W.test(g))throw TypeError("invalid Plugin companion command");let r=u(t.version,"Plugin companion version",255);if(!v.test(r))throw TypeError("Plugin companion version must be SemVer");if(!Array.isArray(t.targets)||t.targets.length===0||t.targets.length>16)throw TypeError("Plugin companion targets must be bounded");let p=t.targets.map((d)=>{let T=c(d,"Plugin companion target");m(T,["platform","arch","artifact"],["platform","arch","artifact"],"Plugin companion target");let b;switch(T.platform){case"darwin":case"linux":case"win32":b=T.platform;break;default:throw TypeError("invalid companion platform")}let x;switch(T.arch){case"arm64":case"x64":x=T.arch;break;default:throw TypeError("invalid companion architecture")}let l=c(T.artifact,"Plugin companion artifact");m(l,["url","size","sha256"],["url","size","sha256"],"Plugin companion artifact");let j=$(l.size,"Plugin companion size",134217728);if(j<1)throw TypeError("Plugin companion size must be positive");return{platform:b,arch:x,artifact:{url:_(l.url,"Plugin companion URL"),size:j,sha256:w(l.sha256,"Plugin companion sha256")}}});if(new Set(p.map((d)=>`${d.platform}-${d.arch}`)).size!==p.length)throw TypeError("duplicate Plugin companion target");return{command:g,version:r,targets:p}});if(new Set(y.map(({command:h})=>h)).size!==y.length)throw TypeError("duplicate Plugin companion command");return y})();if(e!=="skill"&&n.ownerPluginId!==void 0)throw TypeError("only Skill may declare ownerPluginId");if(e==="mcp-server"){let y=f.kind==="artifact"?void 0:f.serverJson;if(y?.name!==i||y.version!==s)throw TypeError("MCP registry identity must match server.json name/version")}return{kind:e,id:i,version:s,compatibility:B(n.compatibility),presentation:J(n.presentation),delivery:f,...n.yanked===void 0?{}:{yanked:n.yanked},...n.manifest===void 0?{}:{manifest:n.manifest},...a?{companions:a}:{},...n.ownerPluginId===void 0?{}:{ownerPluginId:u(n.ownerPluginId,"ownerPluginId",80)}}}function cn(o){let n=c(o,"registry");if(m(n,["schema","marketplaceId","sequence","revision","packages"],["schema","marketplaceId","sequence","revision","packages"],"registry"),n.schema!=="convax.registry/2")throw TypeError("unsupported Registry schema");if(!Array.isArray(n.packages)||n.packages.length>16384)throw TypeError("Registry packages must be a bounded array");let e=n.packages.map(V),i=new Set;for(let y of e){let h=`${y.kind}\x00${y.id}`;if(i.has(h))throw TypeError(`duplicate Registry identity ${y.kind}/${y.id}`);i.add(h)}let s=u(n.marketplaceId,"marketplaceId",63);if(!U.test(s))throw TypeError("marketplaceId must be a lowercase Marketplace slug");let f=$(n.sequence,"sequence");if(f<1)throw TypeError("Registry sequence must be positive");let a=u(n.revision,"revision",64);if(!C.test(a))throw TypeError("Registry revision must be a 64-character lowercase content SHA-256");if(a!==R(L(e)))throw TypeError("Registry revision does not match canonical package content");return{schema:"convax.registry/2",marketplaceId:s,sequence:f,revision:a,packages:e}}function un(o,n,e){if(e.id!==n.marketplaceId)throw TypeError("Showcase descriptor does not match Registry Marketplace");let i=c(o,"Showcase");if(m(i,["schema","marketplaceId","revision","packages"],["schema","marketplaceId","revision","packages"],"Showcase"),i.schema!=="convax.showcase/2")throw TypeError("unsupported Showcase schema");if(i.marketplaceId!==n.marketplaceId||i.revision!==n.revision)throw TypeError("Showcase source identity/revision does not match Registry");if(!Array.isArray(i.packages)||i.packages.length>n.packages.length)throw TypeError("Showcase packages must be bounded by the Registry");let s=new Map(n.packages.map((h)=>[`${h.kind}\x00${h.id}`,h])),f=new Set,a=(h,t,g,r)=>{let p=c(h,t);m(p,["url","size","sha256","mime","alt","width","height"],["url","size","sha256","mime"],t);let d=u(p.mime,`${t}.mime`,32);if(!g.has(d))throw TypeError(`${t}.mime is unsupported`);let T=$(p.size,`${t}.size`,r);if(T<1)throw TypeError(`${t}.size must be positive`);if(p.width===void 0!==(p.height===void 0))throw TypeError(`${t} dimensions must be declared together`);let b=p.width===void 0?void 0:$(p.width,`${t}.width`,8192),x=p.height===void 0?void 0:$(p.height,`${t}.height`,8192);if(b===0||x===0)throw TypeError(`${t} dimensions must be positive`);let l=new URL(O(p.url,`${t}.url`)),j=`/${e.repository.owner}/${e.repository.name}/releases/download/`,I=l.pathname.slice(j.length).split("/"),Z=`registry-v2-${n.revision}`;if(l.hostname.toLowerCase()!=="github.com"||l.port!==""||!l.pathname.startsWith(j)||I.length!==2||I[0]!==Z||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(I[0]??"")||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(I[1]??""))throw TypeError(`${t}.url must be an immutable Registry revision Release asset in the declared repository`);return{url:l.toString(),size:T,sha256:w(p.sha256,`${t}.sha256`),mime:d,...p.alt===void 0?{}:{alt:u(p.alt,`${t}.alt`,512)},...b===void 0?{}:{width:b,height:x}}},y=i.packages.map((h)=>{let t=c(h,"Showcase package");if(m(t,["kind","id","version","presentation"],["kind","id","version","presentation"],"Showcase package"),!S.has(t.kind))throw TypeError("unsupported Showcase package kind");let g=t.kind,r=u(t.id,"Showcase package id",200),p=u(t.version,"Showcase package version",255),d=`${g}\x00${r}`;if(f.has(d))throw TypeError(`duplicate Showcase identity ${g}/${r}`);f.add(d);let T=s.get(d);if(!T||T.version!==p)throw TypeError(`Showcase package ${g}/${r}@${p} does not match Registry`);let b=c(t.presentation,"Showcase presentation");return m(b,["name","description","poster","animation"],["name","poster"],"Showcase presentation"),{kind:g,id:r,version:p,presentation:{name:u(b.name,"Showcase presentation.name",100),...b.description===void 0?{}:{description:u(b.description,"Showcase presentation.description",1024)},poster:a(b.poster,"Showcase poster",new Set(["image/png","image/jpeg","image/webp"]),16777216),...b.animation===void 0?{}:{animation:a(b.animation,"Showcase animation",new Set(["video/mp4","video/webm"]),67108864)}}}});return{schema:"convax.showcase/2",marketplaceId:n.marketplaceId,revision:n.revision,packages:y}}function fn(o){let n=c(o,"Builtin bundle");if(m(n,["schema","release","members"],["schema","release","members"],"Builtin bundle"),n.schema!=="convax.builtin-bundle/1")throw TypeError("unsupported Builtin bundle schema");let e=c(n.release,"Builtin release");if(m(e,["id"],["id"],"Builtin release"),!Array.isArray(n.members)||n.members.length===0||n.members.length>128)throw TypeError("Builtin members must be a bounded non-empty array");let i=new Set,s=new Set,f=n.members.map((h)=>{let t=c(h,"Builtin member");if(m(t,["kind","id","version","artifact","presentation"],["kind","id","version","artifact","presentation"],"Builtin member"),t.kind!=="plugin"&&t.kind!=="skill")throw TypeError("Builtin V1 admits only Plugin and Skill");let g=(b,x)=>{let l=c(b,x);m(l,["path","size","sha256"],["path","size","sha256"],x);let j=u(l.path,`${x}.path`,256);if(!/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(j)||j.includes(".."))throw TypeError(`${x}.path is unsafe`);if(i.has(j))throw TypeError(`duplicate Builtin artifact path ${j}`);i.add(j);let I=$(l.size,`${x}.size`,134217728);if(I<1)throw TypeError(`${x}.size must be positive`);return{path:j,size:I,sha256:w(l.sha256,`${x}.sha256`)}},r=u(t.id,"Builtin member id",200);if(!Q.test(r)||r.length>80)throw TypeError("Builtin member id must be a lowercase slug");let p=`${t.kind}\x00${r}`;if(s.has(p))throw TypeError(`duplicate Builtin member ${t.kind}/${r}`);s.add(p);let d=c(t.presentation,"Builtin member presentation");m(d,["poster","animation"],["poster"],"Builtin member presentation");let T=(b,x)=>{let l=c(b,x);m(l,["path","mime","size","sha256"],["path","mime","size","sha256"],x);let j=u(l.mime,`${x}.mime`,100);if(!(x==="Builtin poster"?new Set(["image/png","image/jpeg","image/webp"]):new Set(["video/mp4","video/webm"])).has(j))throw TypeError(`${x}.mime is unsupported`);return{...g({path:l.path,size:l.size,sha256:l.sha256},x),mime:j}};return{kind:t.kind,id:r,version:(()=>{let b=u(t.version,"Builtin member version",255);if(!v.test(b))throw TypeError("Builtin member version must be SemVer");return b})(),artifact:g(t.artifact,"Builtin member artifact"),presentation:{poster:T(d.poster,"Builtin poster"),...d.animation===void 0?{}:{animation:T(d.animation,"Builtin animation")}}}}),a=(()=>{let h=u(e.id,"Builtin release id",64);if(!C.test(h))throw TypeError("Builtin release id must be a lowercase content SHA-256");return h})(),y=R(L(f));if(a!==y)throw TypeError("Builtin release id must equal the canonical member content digest");return{schema:"convax.builtin-bundle/1",release:{id:a},members:f}}function K(o,n){if(!P(o)){let g=P.errors?.[0],r=(g?.instancePath||"/").slice(0,160),p=(g?.keyword||"invalid").slice(0,64);throw TypeError(`server.json does not match the vendored official schema at ${r} (${p})`)}let e=c(o,"server.json"),i=u(e.name,"server.json.name",200);if(!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(i))throw TypeError("invalid server.json name");let s=u(e.description,"server.json.description",100),f=u(e.version,"server.json.version",255);if(!F.test(f))throw TypeError("server.json.version is unsafe");let a=n===void 0?void 0:X(n);if(a){if(Array.isArray(e.remotes)&&e.remotes.length>0||Array.isArray(e.packages)&&e.packages.length>0)throw TypeError("mixed HTTP and managed-stdio profiles are forbidden");return{supported:!0,package:{id:i,version:f,definition:e,runtime:{kind:"managed-stdio",command:a.runtime.command,argv:a.runtime.argv,targets:a.runtime.compatibility.targets},extension:a}}}let h=(Array.isArray(e.remotes)?e.remotes:[]).flatMap((g)=>{let r=c(g,"server.json remote");if(r.type!=="streamable-http"&&r.type!=="sse")return[];if(r.variables!==void 0||r.headers!==void 0)return[];if(typeof r.url!=="string"||/[{}]/.test(r.url))return[];try{return[{endpoint:O(r.url,"MCP endpoint"),transport:r.type}]}catch{return[]}});if(h.length===0)return{supported:!1,id:i,version:f,definition:e,reason:"no-supported-runtime"};if(h.length>1)throw TypeError("server.json must contain exactly one supported fixed HTTPS remote");let t=h[0];return{supported:!0,package:{id:i,version:f,definition:e,runtime:{kind:"http-agent",endpoint:t.endpoint,transport:t.transport}}}}function k(o,n){let e=K(o,n);if(!e.supported)throw TypeError("server.json must contain exactly one supported fixed HTTPS remote");return e.package}export{un as parseShowcaseV2,k as parseServerPackage,cn as parseRegistryV2,X as parseMcpServerExtension,hn as parseMarketplaceDescriptor,fn as parseBuiltinBundle,K as classifyServerPackageForCatalog};

//# debugId=5D7513B68B0EC75A64756E2164756E21
//# sourceMappingURL=schemas.js.map
