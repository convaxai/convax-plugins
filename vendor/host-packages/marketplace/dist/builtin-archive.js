import{createHash as Gn}from"node:crypto";function W(p){let n=(o)=>{if(o===null||typeof o==="string"||typeof o==="boolean")return o;if(typeof o==="number"){if(!Number.isFinite(o))throw TypeError("canonical JSON rejects non-finite numbers");return Object.is(o,-0)?0:o}if(Array.isArray(o))return o.map(n);if(typeof o==="object"){let t=o;return Object.fromEntries(Object.keys(t).sort().map((e)=>{if(t[e]===void 0)throw TypeError("canonical JSON rejects undefined");return[e,n(t[e])]}))}throw TypeError(`canonical JSON rejects ${typeof o}`)};return JSON.stringify(n(p))}function X(p){return Gn("sha256").update(p).digest("hex")}var to="https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",po="3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0";var io=new TextEncoder().encode(`{
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
`),rn=JSON.parse(`{
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
`);import Qn from"ajv";var cn=new Set(["plugin","skill","mcp-server"]),N=/^[0-9a-f]{64}$/,On=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/,sn=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,V=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,jn=/^[0-9A-Za-z][0-9A-Za-z._+-]{0,254}$/,wn=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,In=/^[A-Za-z0-9._-]+$/,xn=/^(darwin|linux|win32)-(arm64|x64)$/,Tn=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i,fn=3,$n=new Qn({strict:!0,strictRequired:!1,allErrors:!1,coerceTypes:!1,useDefaults:!1,removeAdditional:!1,validateFormats:!1});$n.addKeyword({keyword:"example",valid:!0});var mn=$n.compile(rn);function c(p,n){if(p===null||typeof p!=="object"||Array.isArray(p))throw TypeError(`${n} must be an object`);return p}function x(p,n,o,t){for(let e of Object.keys(p))if(!n.includes(e))throw TypeError(`${t} has unknown property ${e}`);for(let e of o)if(!(e in p))throw TypeError(`${t} is missing ${e}`)}function s(p,n,o=4096){if(typeof p!=="string"||p.length===0||p.length>o)throw TypeError(`${n} must be a non-empty string of at most ${o} characters`);return p}function M(p,n,o=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(p)||p<0||p>o)throw TypeError(`${n} must be a non-negative safe integer`);return p}function F(p,n){let o=s(p,n,64);if(!N.test(o))throw TypeError(`${n} must be a lowercase SHA-256 digest`);return o}function E(p){return X(new TextEncoder().encode(`${W(p)}
`))}function Q(p,n){let o=new URL(s(p,n));if(o.protocol!=="https:"||o.username||o.password||o.search||o.hash)throw TypeError(`${n} must be an HTTPS URL without credentials, query, or fragment`);return o.toString()}function z(p,n){let o=new URL(Q(p,n)),t=o.pathname.split("/").filter(Boolean);if(o.hostname.toLowerCase()!=="github.com"||o.port!==""||t.length!==6||o.pathname!==`/${t.join("/")}`||t[2]!=="releases"||t[3]!=="download"||t[4]?.toLowerCase()==="latest"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(t[4]??"")||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(t[5]??""))throw TypeError(`${n} must be an immutable GitHub Release asset URL`);return o.toString()}function Rn(p){let n=c(p,"compatibility");return x(n,["convax"],["convax"],"compatibility"),{convax:s(n.convax,"compatibility.convax",128)}}function Jn(p){let n=c(p,"presentation");return x(n,["name","description"],["name"],"presentation"),{name:s(n.name,"presentation.name",100),...n.description===void 0?{}:{description:s(n.description,"presentation.description",1024)}}}function Dn(p){let n=c(p,"artifact delivery");if(x(n,["kind","url","size","sha256"],["kind","url","size","sha256"],"artifact delivery"),n.kind!=="artifact")throw TypeError("artifact delivery kind must be artifact");let o=M(n.size,"artifact size",134217728);if(o<1)throw TypeError("artifact size must be positive");return{kind:"artifact",url:z(n.url,"artifact URL"),size:o,sha256:F(n.sha256,"artifact sha256")}}function fo(p){let n=c(p,"marketplace descriptor");if(x(n,["schema","id","name","publisher","repository","registry","showcase","compatibility","delivery"],["schema","id","name","publisher","repository","registry","showcase","compatibility","delivery"],"marketplace descriptor"),n.schema!=="convax.marketplace/1")throw TypeError("unsupported marketplace descriptor schema");let o=s(n.id,"marketplace id",63);if(!sn.test(o))throw TypeError("invalid marketplace id");let t=c(n.publisher,"publisher");x(t,["name"],["name"],"publisher");let e=c(n.repository,"repository");x(e,["owner","name"],["owner","name"],"repository");let m=c(n.registry,"registry");x(m,["v2"],["v2"],"registry");let g=c(m.v2,"registry.v2");x(g,["url"],["url"],"registry.v2");let j=c(n.showcase,"showcase");x(j,["v2"],["v2"],"showcase");let r=c(j.v2,"showcase.v2");x(r,["url"],["url"],"showcase.v2");let i=c(n.delivery,"delivery");if(x(i,["kind"],["kind"],"delivery"),i.kind!=="github-pages-releases")throw TypeError("unsupported delivery policy");let I=s(e.owner,"repository owner",100),u=s(e.name,"repository name",100);if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(I)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(u)||u==="."||u==="..")throw TypeError("repository owner/name must be valid GitHub repository path segments");let h=($,f)=>{let T=new URL(Q($,f)),b=`${I.toLowerCase()}.github.io`,R=T.pathname.split("/").filter(Boolean);if(T.hostname.toLowerCase()!==b||T.port!==""||!T.pathname.startsWith(`/${u}/`)||T.pathname!==`/${R.join("/")}`||R.some((H)=>!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(H))||T.search)throw TypeError(`${f} must use the declared repository GitHub Pages origin`);return T.toString()};return{schema:"convax.marketplace/1",id:o,name:s(n.name,"marketplace name",100),publisher:{name:s(t.name,"publisher name",100)},repository:{owner:I,name:u},registry:{v2:{url:h(g.url,"registry.v2.url")}},showcase:{v2:{url:h(r.url,"showcase.v2.url")}},compatibility:Rn(n.compatibility),delivery:{kind:"github-pages-releases"}}}function bn(p){let n=c(p,"MCP extension");if(x(n,["schema","runtime","productActions","grants"],["schema","runtime"],"MCP extension"),n.schema!=="convax.mcp-server-extension/1")throw TypeError("unsupported MCP extension schema");let o=c(n.runtime,"MCP runtime");if(x(o,["kind","command","argv","compatibility"],["kind","command","argv","compatibility"],"MCP runtime"),o.kind!=="managed-stdio")throw TypeError("MCP extension must use managed-stdio");let t=s(o.command,"MCP command",128);if(!In.test(t)||Tn.test(t))throw TypeError("invalid bare MCP command");if(!Array.isArray(o.argv)||o.argv.length>32)throw TypeError("MCP argv must be a bounded array");let e=o.argv.map((u,h)=>{let $=s(u,`MCP argv[${h}]`,1024);if($.includes("\x00"))throw TypeError("MCP argv cannot contain NUL");return $}),m=c(o.compatibility,"MCP runtime compatibility");if(x(m,["targets"],["targets"],"MCP runtime compatibility"),!Array.isArray(m.targets)||m.targets.length===0||m.targets.length>8)throw TypeError("MCP runtime must declare bounded targets");let g=m.targets.map((u)=>s(u,"MCP target",32));if(new Set(g).size!==g.length||g.some((u)=>!xn.test(u)))throw TypeError("invalid or duplicate MCP target");let j=new Set(["canvas.import","canvas.export","project.files.read"]),r=n.productActions===void 0?void 0:(()=>{if(!Array.isArray(n.productActions)||n.productActions.length>32)throw TypeError("MCP product actions must be bounded");return n.productActions.map((u)=>{let h=c(u,"MCP product action");x(h,["action","tool"],["action","tool"],"MCP product action");let $=s(h.action,"MCP product action name",64);if(!j.has($))throw TypeError("unsupported MCP product action");return{action:$,tool:s(h.tool,"MCP product tool",128)}})})(),i=new Set(["canvas.read","canvas.write","project.files.read"]),I=n.grants===void 0?void 0:(()=>{if(!Array.isArray(n.grants)||n.grants.length>16)throw TypeError("MCP grants must be bounded");return n.grants.map((u)=>{let h=s(u,"MCP grant",64);if(!i.has(h))throw TypeError("unsupported MCP grant");return h})})();return{schema:"convax.mcp-server-extension/1",runtime:{kind:"managed-stdio",command:t,argv:e,compatibility:{targets:g}},...r?{productActions:r}:{},...I?{grants:I}:{}}}function En(p,n){let o=c(p,"delivery");if(o.kind==="artifact"){if(n==="mcp-server")throw TypeError("MCP Server cannot use a static artifact delivery");return Dn(o)}if(n!=="mcp-server")throw TypeError("only MCP Server may use MCP delivery");if(o.kind==="mcp-http"){x(o,["kind","serverJson","serverJsonSha256","runtime"],["kind","serverJson","serverJsonSha256","runtime"],"MCP HTTP delivery");let t=c(o.serverJson,"serverJson"),e=gn(t);if(e.runtime.kind!=="http-agent")throw TypeError("MCP HTTP delivery must contain HTTP definition");let m=c(o.runtime,"MCP HTTP runtime");if(x(m,["endpoint","transport"],["endpoint","transport"],"MCP HTTP runtime"),m.endpoint!==e.runtime.endpoint||m.transport!==e.runtime.transport)throw TypeError("MCP HTTP runtime does not match server.json");let g=F(o.serverJsonSha256,"serverJsonSha256");if(g!==E(t))throw TypeError("serverJsonSha256 does not match canonical server.json bytes");return{kind:"mcp-http",serverJson:t,serverJsonSha256:g,runtime:{endpoint:e.runtime.endpoint,transport:e.runtime.transport}}}if(o.kind==="mcp-managed-stdio"){x(o,["kind","serverJson","serverJsonSha256","extension","extensionSha256","companions"],["kind","serverJson","serverJsonSha256","extension","extensionSha256","companions"],"managed MCP delivery");let t=c(o.serverJson,"serverJson"),e=bn(o.extension);if(gn(t,e),!Array.isArray(o.companions)||o.companions.length===0||o.companions.length>8)throw TypeError("managed MCP delivery must contain bounded companions");let m=o.companions.map((r)=>{let i=c(r,"companion");x(i,["target","command","url","size","sha256"],["target","command","url","size","sha256"],"companion");let I=s(i.target,"companion target",32);if(!xn.test(I))throw TypeError("invalid companion target");let u=s(i.command,"companion command",128);if(u!==e.runtime.command)throw TypeError("companion command does not match extension");let h=M(i.size,"companion size",134217728);if(h<1)throw TypeError("companion size must be positive");return{target:I,command:u,url:z(i.url,"companion URL"),size:h,sha256:F(i.sha256,"companion sha256")}});if(new Set(m.map(({target:r})=>r)).size!==m.length)throw TypeError("duplicate companion target");if(m.some(({target:r})=>!e.runtime.compatibility.targets.includes(r)))throw TypeError("companion target is outside extension compatibility");let g=F(o.serverJsonSha256,"serverJsonSha256");if(g!==E(t))throw TypeError("serverJsonSha256 does not match canonical server.json bytes");let j=F(o.extensionSha256,"extensionSha256");if(j!==E(e))throw TypeError("extensionSha256 does not match canonical extension bytes");return{kind:"mcp-managed-stdio",serverJson:t,serverJsonSha256:g,extension:e,extensionSha256:j,companions:m}}throw TypeError("unsupported delivery kind")}function Vn(p){let n=c(p,"registry package");if(x(n,["kind","id","version","compatibility","presentation","delivery","yanked","manifest","companions","ownerPluginId"],["kind","id","version","compatibility","presentation","delivery"],"registry package"),!cn.has(n.kind))throw TypeError("unsupported package kind");let o=n.kind,t=s(n.id,"package id",200);if(!On.test(t))throw TypeError("invalid package id");let e=s(n.version,"package version",255);if(o==="mcp-server"?!jn.test(e):!V.test(e))throw TypeError(`${o} version is unsafe or unsupported`);let m=En(n.delivery,o);if(n.yanked!==void 0&&typeof n.yanked!=="boolean")throw TypeError("yanked must be boolean");if(o==="plugin"&&n.manifest===void 0)throw TypeError("Plugin Registry package must project its manifest");if(o==="plugin"){let j=c(n.manifest,"Plugin manifest projection");if(j.id!==t||j.version!==e)throw TypeError("Plugin manifest identity must match its Registry entry");let r=typeof j.schema==="string"&&/^convax\.plugin\/[1-7]$/.test(j.schema);if(j.schema!=="convax.plugin/8"&&!r)throw TypeError("Plugin manifest schema is unsupported");if(!r){let i=c(j.hostApi,"Plugin manifest hostApi");x(i,["major","required","optional"],["major","required","optional"],"Plugin manifest hostApi");let I=/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;if(i.major!==fn)throw TypeError(`Plugin manifest hostApi major must be ${fn}`);if(!Array.isArray(i.required)||!Array.isArray(i.optional)||[...i.required,...i.optional].some(($)=>typeof $!=="string"||!I.test($)))throw TypeError("Plugin manifest hostApi declaration is invalid");let{required:u,optional:h}=i;if(new Set(u).size!==u.length||new Set(h).size!==h.length||h.some(($)=>u.includes($)))throw TypeError("Plugin manifest hostApi declaration contains duplicate or overlapping APIs")}}if(o!=="plugin"&&n.manifest!==void 0)throw TypeError("only Plugin may project a manifest");let g=n.companions===void 0?void 0:(()=>{if(o!=="plugin"||!Array.isArray(n.companions)||n.companions.length===0||n.companions.length>16)throw TypeError("Plugin companions must be a bounded array");let j=n.companions.map((r)=>{let i=c(r,"Plugin companion");x(i,["command","version","targets"],["command","version","targets"],"Plugin companion");let I=s(i.command,"Plugin companion command",128);if(!In.test(I)||Tn.test(I))throw TypeError("invalid Plugin companion command");let u=s(i.version,"Plugin companion version",255);if(!V.test(u))throw TypeError("Plugin companion version must be SemVer");if(!Array.isArray(i.targets)||i.targets.length===0||i.targets.length>16)throw TypeError("Plugin companion targets must be bounded");let h=i.targets.map(($)=>{let f=c($,"Plugin companion target");x(f,["platform","arch","artifact"],["platform","arch","artifact"],"Plugin companion target");let T;switch(f.platform){case"darwin":case"linux":case"win32":T=f.platform;break;default:throw TypeError("invalid companion platform")}let b;switch(f.arch){case"arm64":case"x64":b=f.arch;break;default:throw TypeError("invalid companion architecture")}let R=c(f.artifact,"Plugin companion artifact");x(R,["url","size","sha256"],["url","size","sha256"],"Plugin companion artifact");let H=M(R.size,"Plugin companion size",134217728);if(H<1)throw TypeError("Plugin companion size must be positive");return{platform:T,arch:b,artifact:{url:z(R.url,"Plugin companion URL"),size:H,sha256:F(R.sha256,"Plugin companion sha256")}}});if(new Set(h.map(($)=>`${$.platform}-${$.arch}`)).size!==h.length)throw TypeError("duplicate Plugin companion target");return{command:I,version:u,targets:h}});if(new Set(j.map(({command:r})=>r)).size!==j.length)throw TypeError("duplicate Plugin companion command");return j})();if(o!=="skill"&&n.ownerPluginId!==void 0)throw TypeError("only Skill may declare ownerPluginId");if(o==="mcp-server"){let j=m.kind==="artifact"?void 0:m.serverJson;if(j?.name!==t||j.version!==e)throw TypeError("MCP registry identity must match server.json name/version")}return{kind:o,id:t,version:e,compatibility:Rn(n.compatibility),presentation:Jn(n.presentation),delivery:m,...n.yanked===void 0?{}:{yanked:n.yanked},...n.manifest===void 0?{}:{manifest:n.manifest},...g?{companions:g}:{},...n.ownerPluginId===void 0?{}:{ownerPluginId:s(n.ownerPluginId,"ownerPluginId",80)}}}function mo(p){let n=c(p,"registry");if(x(n,["schema","marketplaceId","sequence","revision","packages"],["schema","marketplaceId","sequence","revision","packages"],"registry"),n.schema!=="convax.registry/2")throw TypeError("unsupported Registry schema");if(!Array.isArray(n.packages)||n.packages.length>16384)throw TypeError("Registry packages must be a bounded array");let o=n.packages.map(Vn),t=new Set;for(let j of o){let r=`${j.kind}\x00${j.id}`;if(t.has(r))throw TypeError(`duplicate Registry identity ${j.kind}/${j.id}`);t.add(r)}let e=s(n.marketplaceId,"marketplaceId",63);if(!sn.test(e))throw TypeError("marketplaceId must be a lowercase Marketplace slug");let m=M(n.sequence,"sequence");if(m<1)throw TypeError("Registry sequence must be positive");let g=s(n.revision,"revision",64);if(!N.test(g))throw TypeError("Registry revision must be a 64-character lowercase content SHA-256");if(g!==X(W(o)))throw TypeError("Registry revision does not match canonical package content");return{schema:"convax.registry/2",marketplaceId:e,sequence:m,revision:g,packages:o}}function go(p,n,o){if(o.id!==n.marketplaceId)throw TypeError("Showcase descriptor does not match Registry Marketplace");let t=c(p,"Showcase");if(x(t,["schema","marketplaceId","revision","packages"],["schema","marketplaceId","revision","packages"],"Showcase"),t.schema!=="convax.showcase/2")throw TypeError("unsupported Showcase schema");if(t.marketplaceId!==n.marketplaceId||t.revision!==n.revision)throw TypeError("Showcase source identity/revision does not match Registry");if(!Array.isArray(t.packages)||t.packages.length>n.packages.length)throw TypeError("Showcase packages must be bounded by the Registry");let e=new Map(n.packages.map((r)=>[`${r.kind}\x00${r.id}`,r])),m=new Set,g=(r,i,I,u)=>{let h=c(r,i);x(h,["url","size","sha256","mime","alt","width","height"],["url","size","sha256","mime"],i);let $=s(h.mime,`${i}.mime`,32);if(!I.has($))throw TypeError(`${i}.mime is unsupported`);let f=M(h.size,`${i}.size`,u);if(f<1)throw TypeError(`${i}.size must be positive`);if(h.width===void 0!==(h.height===void 0))throw TypeError(`${i} dimensions must be declared together`);let T=h.width===void 0?void 0:M(h.width,`${i}.width`,8192),b=h.height===void 0?void 0:M(h.height,`${i}.height`,8192);if(T===0||b===0)throw TypeError(`${i} dimensions must be positive`);let R=new URL(Q(h.url,`${i}.url`)),H=`/${o.repository.owner}/${o.repository.name}/releases/download/`,U=R.pathname.slice(H.length).split("/"),Z=`registry-v2-${n.revision}`;if(R.hostname.toLowerCase()!=="github.com"||R.port!==""||!R.pathname.startsWith(H)||U.length!==2||U[0]!==Z||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(U[0]??"")||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(U[1]??""))throw TypeError(`${i}.url must be an immutable Registry revision Release asset in the declared repository`);return{url:R.toString(),size:f,sha256:F(h.sha256,`${i}.sha256`),mime:$,...h.alt===void 0?{}:{alt:s(h.alt,`${i}.alt`,512)},...T===void 0?{}:{width:T,height:b}}},j=t.packages.map((r)=>{let i=c(r,"Showcase package");if(x(i,["kind","id","version","presentation"],["kind","id","version","presentation"],"Showcase package"),!cn.has(i.kind))throw TypeError("unsupported Showcase package kind");let I=i.kind,u=s(i.id,"Showcase package id",200),h=s(i.version,"Showcase package version",255),$=`${I}\x00${u}`;if(m.has($))throw TypeError(`duplicate Showcase identity ${I}/${u}`);m.add($);let f=e.get($);if(!f||f.version!==h)throw TypeError(`Showcase package ${I}/${u}@${h} does not match Registry`);let T=c(i.presentation,"Showcase presentation");return x(T,["name","description","poster","animation"],["name","poster"],"Showcase presentation"),{kind:I,id:u,version:h,presentation:{name:s(T.name,"Showcase presentation.name",100),...T.description===void 0?{}:{description:s(T.description,"Showcase presentation.description",1024)},poster:g(T.poster,"Showcase poster",new Set(["image/png","image/jpeg","image/webp"]),16777216),...T.animation===void 0?{}:{animation:g(T.animation,"Showcase animation",new Set(["video/mp4","video/webm"]),67108864)}}}});return{schema:"convax.showcase/2",marketplaceId:n.marketplaceId,revision:n.revision,packages:j}}function Hn(p){let n=c(p,"Builtin bundle");if(x(n,["schema","release","members"],["schema","release","members"],"Builtin bundle"),n.schema!=="convax.builtin-bundle/1")throw TypeError("unsupported Builtin bundle schema");let o=c(n.release,"Builtin release");if(x(o,["id"],["id"],"Builtin release"),!Array.isArray(n.members)||n.members.length===0||n.members.length>128)throw TypeError("Builtin members must be a bounded non-empty array");let t=new Set,e=new Set,m=n.members.map((r)=>{let i=c(r,"Builtin member");if(x(i,["kind","id","version","artifact","presentation"],["kind","id","version","artifact","presentation"],"Builtin member"),i.kind!=="plugin"&&i.kind!=="skill")throw TypeError("Builtin V1 admits only Plugin and Skill");let I=(T,b)=>{let R=c(T,b);x(R,["path","size","sha256"],["path","size","sha256"],b);let H=s(R.path,`${b}.path`,256);if(!/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(H)||H.includes(".."))throw TypeError(`${b}.path is unsafe`);if(t.has(H))throw TypeError(`duplicate Builtin artifact path ${H}`);t.add(H);let U=M(R.size,`${b}.size`,134217728);if(U<1)throw TypeError(`${b}.size must be positive`);return{path:H,size:U,sha256:F(R.sha256,`${b}.sha256`)}},u=s(i.id,"Builtin member id",200);if(!wn.test(u)||u.length>80)throw TypeError("Builtin member id must be a lowercase slug");let h=`${i.kind}\x00${u}`;if(e.has(h))throw TypeError(`duplicate Builtin member ${i.kind}/${u}`);e.add(h);let $=c(i.presentation,"Builtin member presentation");x($,["poster","animation"],["poster"],"Builtin member presentation");let f=(T,b)=>{let R=c(T,b);x(R,["path","mime","size","sha256"],["path","mime","size","sha256"],b);let H=s(R.mime,`${b}.mime`,100);if(!(b==="Builtin poster"?new Set(["image/png","image/jpeg","image/webp"]):new Set(["video/mp4","video/webm"])).has(H))throw TypeError(`${b}.mime is unsupported`);return{...I({path:R.path,size:R.size,sha256:R.sha256},b),mime:H}};return{kind:i.kind,id:u,version:(()=>{let T=s(i.version,"Builtin member version",255);if(!V.test(T))throw TypeError("Builtin member version must be SemVer");return T})(),artifact:I(i.artifact,"Builtin member artifact"),presentation:{poster:f($.poster,"Builtin poster"),...$.animation===void 0?{}:{animation:f($.animation,"Builtin animation")}}}}),g=(()=>{let r=s(o.id,"Builtin release id",64);if(!N.test(r))throw TypeError("Builtin release id must be a lowercase content SHA-256");return r})(),j=X(W(m));if(g!==j)throw TypeError("Builtin release id must equal the canonical member content digest");return{schema:"convax.builtin-bundle/1",release:{id:g},members:m}}function Nn(p,n){if(!mn(p)){let I=mn.errors?.[0],u=(I?.instancePath||"/").slice(0,160),h=(I?.keyword||"invalid").slice(0,64);throw TypeError(`server.json does not match the vendored official schema at ${u} (${h})`)}let o=c(p,"server.json"),t=s(o.name,"server.json.name",200);if(!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(t))throw TypeError("invalid server.json name");let e=s(o.description,"server.json.description",100),m=s(o.version,"server.json.version",255);if(!jn.test(m))throw TypeError("server.json.version is unsafe");let g=n===void 0?void 0:bn(n);if(g){if(Array.isArray(o.remotes)&&o.remotes.length>0||Array.isArray(o.packages)&&o.packages.length>0)throw TypeError("mixed HTTP and managed-stdio profiles are forbidden");return{supported:!0,package:{id:t,version:m,definition:o,runtime:{kind:"managed-stdio",command:g.runtime.command,argv:g.runtime.argv,targets:g.runtime.compatibility.targets},extension:g}}}let r=(Array.isArray(o.remotes)?o.remotes:[]).flatMap((I)=>{let u=c(I,"server.json remote");if(u.type!=="streamable-http"&&u.type!=="sse")return[];if(u.variables!==void 0||u.headers!==void 0)return[];if(typeof u.url!=="string"||/[{}]/.test(u.url))return[];try{return[{endpoint:Q(u.url,"MCP endpoint"),transport:u.type}]}catch{return[]}});if(r.length===0)return{supported:!1,id:t,version:m,definition:o,reason:"no-supported-runtime"};if(r.length>1)throw TypeError("server.json must contain exactly one supported fixed HTTPS remote");let i=r[0];return{supported:!0,package:{id:t,version:m,definition:o,runtime:{kind:"http-agent",endpoint:i.endpoint,transport:i.transport}}}}function gn(p,n){let o=Nn(p,n);if(!o.supported)throw TypeError("server.json must contain exactly one supported fixed HTTPS remote");return o.package}var _n=134217728,Ln=125829120,zn=512,Cn=1048576,Bn=/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/,Kn=(()=>{let p=new Uint32Array(256);for(let n=0;n<256;n++){let o=n;for(let t=0;t<8;t++)o=o&1?3988292384^o>>>1:o>>>1;p[n]=o>>>0}return p})();function dn(p){let n=4294967295;for(let o of p)n=Kn[(n^o)&255]^n>>>8;return(n^4294967295)>>>0}function _(p,n,o){if(n<0||n+2>p.byteLength)throw TypeError(`Builtin ZIP ${o} is truncated`);return p.getUint16(n,!0)}function y(p,n,o){if(n<0||n+4>p.byteLength)throw TypeError(`Builtin ZIP ${o} is truncated`);return p.getUint32(n,!0)}function vn(p){let n;try{n=new TextDecoder("utf-8",{fatal:!0}).decode(p)}catch{throw TypeError("Builtin ZIP entry name is not valid UTF-8")}if(!n||n.length>256||!Bn.test(n)||n.split("/").some((o)=>o===".."))throw TypeError(`Builtin ZIP entry path is unsafe: ${n}`);return n}function an(p,n){return p<n?-1:p>n?1:0}function yn(p,n={}){let o=n.maxTotalEntryBytes??Ln;if(!Number.isSafeInteger(o)||o<1||o>Ln)throw TypeError("Builtin ZIP aggregate byte budget must be a positive bounded integer");if(p.byteLength<22||p.byteLength>_n)throw TypeError("Builtin ZIP exceeds its bounded archive size");let t=new DataView(p.buffer,p.byteOffset,p.byteLength),e=p.byteLength-22;if(y(t,e,"EOCD signature")!==101010256)throw TypeError("Builtin ZIP must end with an exact EOCD");let m=_(t,e+4,"disk"),g=_(t,e+6,"central disk"),j=_(t,e+8,"disk entry count"),r=_(t,e+10,"entry count"),i=y(t,e+12,"central size"),I=y(t,e+16,"central offset"),u=_(t,e+20,"comment length");if(m!==0||g!==0||j!==r||r<1||r>zn||u!==0||I+i!==e)throw TypeError("Builtin ZIP has unsupported multi-disk, count, comment, or central-directory shape");let h=new Map,$=new Set,f=I,T=0,b="",R=0;for(let q=0;q<r;q++){if(y(t,f,"central signature")!==33639248)throw TypeError("Builtin ZIP central directory is malformed");let A=_(t,f+4,"central version made by"),k=_(t,f+6,"central version needed"),P=_(t,f+8,"central flags"),B=_(t,f+10,"central method"),K=_(t,f+12,"central modified time"),d=_(t,f+14,"central modified date"),v=y(t,f+16,"central CRC"),a=y(t,f+20,"central compressed size"),Y=y(t,f+24,"central size"),G=_(t,f+28,"central name length"),l=_(t,f+30,"central extra length"),nn=_(t,f+32,"central comment length"),Un=_(t,f+34,"central disk start"),qn=_(t,f+36,"central internal attributes"),on=y(t,f+38,"central external attributes"),L=y(t,f+42,"local offset"),tn=f+46+G+l+nn;if(A!==798||k!==20||P!==2048||B!==0||K!==0||d!==33||a!==Y||Y>_n||G<1||l!==0||nn!==0||Un!==0||qn!==0||on!==27525120&&on!==32309248||tn>e)throw TypeError("Builtin ZIP admits only bounded deterministic stored entries");let pn=p.subarray(f+46,f+46+G),S=vn(pn);if(h.has(S)||b&&an(b,S)>=0)throw TypeError("Builtin ZIP entries must be unique and canonically ordered");let en=S.toLocaleLowerCase("en-US");if($.has(en))throw TypeError("Builtin ZIP entry paths must be unique on case-insensitive filesystems");if($.add(en),b=S,L!==T||y(t,L,"local signature")!==67324752)throw TypeError("Builtin ZIP local records must be contiguous and match the central directory");let kn=_(t,L+4,"local version needed"),Fn=_(t,L+6,"local flags"),Mn=_(t,L+8,"local method"),Pn=_(t,L+10,"local modified time"),Sn=_(t,L+12,"local modified date"),Wn=y(t,L+14,"local CRC"),Xn=y(t,L+18,"local compressed size"),Zn=y(t,L+22,"local size"),w=_(t,L+26,"local name length"),hn=_(t,L+28,"local extra length"),un=L+30+w+hn,J=un+Y;if(kn!==k||Fn!==P||Mn!==B||Pn!==K||Sn!==d||Wn!==v||Xn!==a||Zn!==Y||w!==G||hn!==0||J>I)throw TypeError("Builtin ZIP local entry metadata does not match its central entry");if(!p.subarray(L+30,L+30+w).every((An,Yn)=>An===pn[Yn]))throw TypeError("Builtin ZIP local entry name does not match its central entry");let D=p.subarray(un,J);if(dn(D)!==v)throw TypeError(`Builtin ZIP CRC mismatch for ${S}`);if(R+=D.byteLength,R>o)throw TypeError("Builtin ZIP aggregate uncompressed bytes exceed the archive budget");h.set(S,D),T=J,f=tn}if(f!==e||T!==I)throw TypeError("Builtin ZIP contains unindexed or trailing entry bytes");let H=h.get("bundle.json");if(!H||H.byteLength>Cn)throw TypeError("Builtin ZIP must contain one bounded bundle.json");let U;try{U=JSON.parse(new TextDecoder("utf-8",{fatal:!0}).decode(H))}catch{throw TypeError("Builtin bundle.json is not valid UTF-8 JSON")}let Z=Hn(U),C=new TextEncoder().encode(`${W(Z)}
`);if(H.byteLength!==C.byteLength||!H.every((q,A)=>q===C[A]))throw TypeError("Builtin bundle.json must use the exact canonical JSON encoding");let O=new Set(["bundle.json"]);for(let q of Z.members){let A=[q.artifact,q.presentation.poster,...q.presentation.animation?[q.presentation.animation]:[]];for(let k of A){let P=h.get(k.path);if(!P||P.byteLength!==k.size||X(P)!==k.sha256)throw TypeError(`Builtin bundle asset does not match bundle.json: ${k.path}`);O.add(k.path)}}if(O.size!==h.size||[...h.keys()].some((q)=>!O.has(q)))throw TypeError("Builtin ZIP contains assets not declared by bundle.json");return{bundle:Z,entries:h}}function Io(p,n={}){return yn(p,n).bundle}function xo(p,n){let{bundle:o,entries:t}=yn(p);if(n.bundleReleaseId!==o.release.id)throw TypeError("Builtin delivery belongs to another bundle release");if(!o.members.find((g)=>g.artifact.path===n.path&&g.artifact.size===n.size&&g.artifact.sha256===n.sha256)){let g=o.members.find((j)=>j.artifact.path===n.path);throw TypeError(g?"Builtin delivery size or SHA-256 does not match its verified bundle member":"Builtin delivery path does not match a verified bundle member")}let m=t.get(n.path);if(!m)throw TypeError("Builtin delivery member bytes are missing");return m.slice()}function To(p,n){let o=p.members.find((t)=>t.kind===n.kind&&t.id===n.id);if(!o)throw TypeError(`Builtin bundle does not contain ${n.kind}/${n.id}`);return{kind:"builtin-artifact",bundleReleaseId:p.release.id,path:o.artifact.path,size:o.artifact.size,sha256:o.artifact.sha256}}export{xo as readBuiltinBundleMember,To as projectBuiltinMemberDelivery,Io as parseBuiltinBundleArchive};

//# debugId=AD6221A50E1A3FEF64756E2164756E21
//# sourceMappingURL=builtin-archive.js.map
