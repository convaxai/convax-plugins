import{createHash as bn}from"node:crypto";function X(o){let n=(t)=>{if(t===null||typeof t==="string"||typeof t==="boolean")return t;if(typeof t==="number"){if(!Number.isFinite(t))throw TypeError("canonical JSON rejects non-finite numbers");return Object.is(t,-0)?0:t}if(Array.isArray(t))return t.map(n);if(typeof t==="object"){let p=t;return Object.fromEntries(Object.keys(p).sort().map((i)=>{if(p[i]===void 0)throw TypeError("canonical JSON rejects undefined");return[i,n(p[i])]}))}throw TypeError(`canonical JSON rejects ${typeof t}`)};return JSON.stringify(n(o))}function Z(o){return bn("sha256").update(o).digest("hex")}import Hn from"ajv";var Yn=new TextEncoder().encode(`{
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
`),nn=JSON.parse(`{
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
`);var on=/^[0-9a-f]{64}$/;var _n=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;var Ln=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;var tn=new Hn({strict:!0,strictRequired:!1,allErrors:!1,coerceTypes:!1,useDefaults:!1,removeAdditional:!1,validateFormats:!1});tn.addKeyword({keyword:"example",valid:!0});var Jn=tn.compile(nn);function q(o,n){if(o===null||typeof o!=="object"||Array.isArray(o))throw TypeError(`${n} must be an object`);return o}function k(o,n,t,p){for(let i of Object.keys(o))if(!n.includes(i))throw TypeError(`${p} has unknown property ${i}`);for(let i of t)if(!(i in o))throw TypeError(`${p} is missing ${i}`)}function F(o,n,t=4096){if(typeof o!=="string"||o.length===0||o.length>t)throw TypeError(`${n} must be a non-empty string of at most ${t} characters`);return o}function yn(o,n,t=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(o)||o<0||o>t)throw TypeError(`${n} must be a non-negative safe integer`);return o}function Un(o,n){let t=F(o,n,64);if(!on.test(t))throw TypeError(`${n} must be a lowercase SHA-256 digest`);return t}function pn(o){let n=q(o,"Builtin bundle");if(k(n,["schema","release","members"],["schema","release","members"],"Builtin bundle"),n.schema!=="convax.builtin-bundle/1")throw TypeError("unsupported Builtin bundle schema");let t=q(n.release,"Builtin release");if(k(t,["id"],["id"],"Builtin release"),!Array.isArray(n.members)||n.members.length===0||n.members.length>128)throw TypeError("Builtin members must be a bounded non-empty array");let p=new Set,i=new Set,R=n.members.map((T)=>{let c=q(T,"Builtin member");if(k(c,["kind","id","version","artifact","presentation"],["kind","id","version","artifact","presentation"],"Builtin member"),c.kind!=="plugin"&&c.kind!=="skill")throw TypeError("Builtin V1 admits only Plugin and Skill");let b=(x,u)=>{let m=q(x,u);k(m,["path","size","sha256"],["path","size","sha256"],u);let r=F(m.path,`${u}.path`,256);if(!/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(r)||r.includes(".."))throw TypeError(`${u}.path is unsafe`);if(p.has(r))throw TypeError(`duplicate Builtin artifact path ${r}`);p.add(r);let L=yn(m.size,`${u}.size`,134217728);if(L<1)throw TypeError(`${u}.size must be positive`);return{path:r,size:L,sha256:Un(m.sha256,`${u}.sha256`)}},H=F(c.id,"Builtin member id",200);if(!Ln.test(H)||H.length>80)throw TypeError("Builtin member id must be a lowercase slug");let I=`${c.kind}\x00${H}`;if(i.has(I))throw TypeError(`duplicate Builtin member ${c.kind}/${H}`);i.add(I);let _=q(c.presentation,"Builtin member presentation");k(_,["poster","animation"],["poster"],"Builtin member presentation");let e=(x,u)=>{let m=q(x,u);k(m,["path","mime","size","sha256"],["path","mime","size","sha256"],u);let r=F(m.mime,`${u}.mime`,100);if(!(u==="Builtin poster"?new Set(["image/png","image/jpeg","image/webp"]):new Set(["video/mp4","video/webm"])).has(r))throw TypeError(`${u}.mime is unsupported`);return{...b({path:m.path,size:m.size,sha256:m.sha256},u),mime:r}};return{kind:c.kind,id:H,version:(()=>{let x=F(c.version,"Builtin member version",255);if(!_n.test(x))throw TypeError("Builtin member version must be SemVer");return x})(),artifact:b(c.artifact,"Builtin member artifact"),presentation:{poster:e(_.poster,"Builtin poster"),..._.animation===void 0?{}:{animation:e(_.animation,"Builtin animation")}}}}),j=(()=>{let T=F(t.id,"Builtin release id",64);if(!on.test(T))throw TypeError("Builtin release id must be a lowercase content SHA-256");return T})(),M=Z(X(R));if(j!==M)throw TypeError("Builtin release id must equal the canonical member content digest");return{schema:"convax.builtin-bundle/1",release:{id:j},members:R}}var en=134217728,hn=125829120,qn=512,kn=1048576,Fn=/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/,Mn=(()=>{let o=new Uint32Array(256);for(let n=0;n<256;n++){let t=n;for(let p=0;p<8;p++)t=t&1?3988292384^t>>>1:t>>>1;o[n]=t>>>0}return o})();function Pn(o){let n=4294967295;for(let t of o)n=Mn[(n^t)&255]^n>>>8;return(n^4294967295)>>>0}function h(o,n,t){if(n<0||n+2>o.byteLength)throw TypeError(`Builtin ZIP ${t} is truncated`);return o.getUint16(n,!0)}function g(o,n,t){if(n<0||n+4>o.byteLength)throw TypeError(`Builtin ZIP ${t} is truncated`);return o.getUint32(n,!0)}function Sn(o){let n;try{n=new TextDecoder("utf-8",{fatal:!0}).decode(o)}catch{throw TypeError("Builtin ZIP entry name is not valid UTF-8")}if(!n||n.length>256||!Fn.test(n)||n.split("/").some((t)=>t===".."))throw TypeError(`Builtin ZIP entry path is unsafe: ${n}`);return n}function Wn(o,n){return o<n?-1:o>n?1:0}function un(o,n={}){let t=n.maxTotalEntryBytes??hn;if(!Number.isSafeInteger(t)||t<1||t>hn)throw TypeError("Builtin ZIP aggregate byte budget must be a positive bounded integer");if(o.byteLength<22||o.byteLength>en)throw TypeError("Builtin ZIP exceeds its bounded archive size");let p=new DataView(o.buffer,o.byteOffset,o.byteLength),i=o.byteLength-22;if(g(p,i,"EOCD signature")!==101010256)throw TypeError("Builtin ZIP must end with an exact EOCD");let R=h(p,i+4,"disk"),j=h(p,i+6,"central disk"),M=h(p,i+8,"disk entry count"),T=h(p,i+10,"entry count"),c=g(p,i+12,"central size"),b=g(p,i+16,"central offset"),H=h(p,i+20,"comment length");if(R!==0||j!==0||M!==T||T<1||T>qn||H!==0||b+c!==i)throw TypeError("Builtin ZIP has unsupported multi-disk, count, comment, or central-directory shape");let I=new Map,_=new Set,e=b,x=0,u="",m=0;for(let s=0;s<T;s++){if(g(p,e,"central signature")!==33639248)throw TypeError("Builtin ZIP central directory is malformed");let P=h(p,e+4,"central version made by"),$=h(p,e+6,"central version needed"),y=h(p,e+8,"central flags"),J=h(p,e+10,"central method"),D=h(p,e+12,"central modified time"),E=h(p,e+14,"central modified date"),V=g(p,e+16,"central CRC"),N=g(p,e+20,"central compressed size"),S=g(p,e+24,"central size"),W=h(p,e+28,"central name length"),z=h(p,e+30,"central extra length"),C=h(p,e+32,"central comment length"),rn=h(p,e+34,"central disk start"),fn=h(p,e+36,"central internal attributes"),B=g(p,e+38,"central external attributes"),f=g(p,e+42,"local offset"),K=e+46+W+z+C;if(P!==798||$!==20||y!==2048||J!==0||D!==0||E!==33||N!==S||S>en||W<1||z!==0||C!==0||rn!==0||fn!==0||B!==27525120&&B!==32309248||K>i)throw TypeError("Builtin ZIP admits only bounded deterministic stored entries");let d=o.subarray(e+46,e+46+W),U=Sn(d);if(I.has(U)||u&&Wn(u,U)>=0)throw TypeError("Builtin ZIP entries must be unique and canonically ordered");let v=U.toLocaleLowerCase("en-US");if(_.has(v))throw TypeError("Builtin ZIP entry paths must be unique on case-insensitive filesystems");if(_.add(v),u=U,f!==x||g(p,f,"local signature")!==67324752)throw TypeError("Builtin ZIP local records must be contiguous and match the central directory");let mn=h(p,f+4,"local version needed"),gn=h(p,f+6,"local flags"),cn=h(p,f+8,"local method"),sn=h(p,f+10,"local modified time"),jn=h(p,f+12,"local modified date"),In=g(p,f+14,"local CRC"),xn=g(p,f+18,"local compressed size"),Tn=g(p,f+22,"local size"),G=h(p,f+26,"local name length"),a=h(p,f+28,"local extra length"),l=f+30+G+a,Q=l+S;if(mn!==$||gn!==y||cn!==J||sn!==D||jn!==E||In!==V||xn!==N||Tn!==S||G!==W||a!==0||Q>b)throw TypeError("Builtin ZIP local entry metadata does not match its central entry");if(!o.subarray(f+30,f+30+G).every(($n,Rn)=>$n===d[Rn]))throw TypeError("Builtin ZIP local entry name does not match its central entry");let O=o.subarray(l,Q);if(Pn(O)!==V)throw TypeError(`Builtin ZIP CRC mismatch for ${U}`);if(m+=O.byteLength,m>t)throw TypeError("Builtin ZIP aggregate uncompressed bytes exceed the archive budget");I.set(U,O),x=Q,e=K}if(e!==i||x!==b)throw TypeError("Builtin ZIP contains unindexed or trailing entry bytes");let r=I.get("bundle.json");if(!r||r.byteLength>kn)throw TypeError("Builtin ZIP must contain one bounded bundle.json");let L;try{L=JSON.parse(new TextDecoder("utf-8",{fatal:!0}).decode(r))}catch{throw TypeError("Builtin bundle.json is not valid UTF-8 JSON")}let A=pn(L),w=new TextEncoder().encode(`${X(A)}
`);if(r.byteLength!==w.byteLength||!r.every((s,P)=>s===w[P]))throw TypeError("Builtin bundle.json must use the exact canonical JSON encoding");let Y=new Set(["bundle.json"]);for(let s of A.members){let P=[s.artifact,s.presentation.poster,...s.presentation.animation?[s.presentation.animation]:[]];for(let $ of P){let y=I.get($.path);if(!y||y.byteLength!==$.size||Z(y)!==$.sha256)throw TypeError(`Builtin bundle asset does not match bundle.json: ${$.path}`);Y.add($.path)}}if(Y.size!==I.size||[...I.keys()].some((s)=>!Y.has(s)))throw TypeError("Builtin ZIP contains assets not declared by bundle.json");return{bundle:A,entries:I}}function Nn(o,n={}){return un(o,n).bundle}function zn(o,n){let{bundle:t,entries:p}=un(o);if(n.bundleReleaseId!==t.release.id)throw TypeError("Builtin delivery belongs to another bundle release");if(!t.members.find((j)=>j.artifact.path===n.path&&j.artifact.size===n.size&&j.artifact.sha256===n.sha256)){let j=t.members.find((M)=>M.artifact.path===n.path);throw TypeError(j?"Builtin delivery size or SHA-256 does not match its verified bundle member":"Builtin delivery path does not match a verified bundle member")}let R=p.get(n.path);if(!R)throw TypeError("Builtin delivery member bytes are missing");return R.slice()}function Cn(o,n){let t=o.members.find((p)=>p.kind===n.kind&&p.id===n.id);if(!t)throw TypeError(`Builtin bundle does not contain ${n.kind}/${n.id}`);return{kind:"builtin-artifact",bundleReleaseId:o.release.id,path:t.artifact.path,size:t.artifact.size,sha256:t.artifact.sha256}}export{zn as readBuiltinBundleMember,Cn as projectBuiltinMemberDelivery,Nn as parseBuiltinBundleArchive};

//# debugId=5627D4EC9AAD891464756E2164756E21
//# sourceMappingURL=builtin-archive.js.map
