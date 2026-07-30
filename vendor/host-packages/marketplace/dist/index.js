import{createHmac as Un,timingSafeEqual as xo}from"node:crypto";import{createHash as Jn}from"node:crypto";function j(t){let n=(o)=>{if(o===null||typeof o==="string"||typeof o==="boolean")return o;if(typeof o==="number"){if(!Number.isFinite(o))throw TypeError("canonical JSON rejects non-finite numbers");return Object.is(o,-0)?0:o}if(Array.isArray(o))return o.map(n);if(typeof o==="object"){let i=o;return Object.fromEntries(Object.keys(i).sort().map((p)=>{if(i[p]===void 0)throw TypeError("canonical JSON rejects undefined");return[p,n(i[p])]}))}throw TypeError(`canonical JSON rejects ${typeof o}`)};return JSON.stringify(n(t))}function T(t){return Jn("sha256").update(t).digest("hex")}import Nn from"ajv";var Ho="https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",So="3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0";var Uo=new TextEncoder().encode(`{
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
`),kn=JSON.parse(`{
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
`);var $n=new Set(["plugin","skill","mcp-server"]),C=/^[0-9a-f]{64}$/,Cn=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/,bn=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,N=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,xn=/^[0-9A-Za-z][0-9A-Za-z._+-]{0,254}$/,Bn=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,wn=/^[A-Za-z0-9._-]+$/,Pn=/^(darwin|linux|win32)-(arm64|x64)$/,In=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i,jn=new Nn({strict:!0,strictRequired:!1,allErrors:!1,coerceTypes:!1,useDefaults:!1,removeAdditional:!1,validateFormats:!1});jn.addKeyword({keyword:"example",valid:!0});var an=jn.compile(kn);function a(t,n){if(t===null||typeof t!=="object"||Array.isArray(t))throw TypeError(`${n} must be an object`);return t}function b(t,n,o,i){for(let p of Object.keys(t))if(!n.includes(p))throw TypeError(`${i} has unknown property ${p}`);for(let p of o)if(!(p in t))throw TypeError(`${i} is missing ${p}`)}function l(t,n,o=4096){if(typeof t!=="string"||t.length===0||t.length>o)throw TypeError(`${n} must be a non-empty string of at most ${o} characters`);return t}function z(t,n,o=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(t)||t<0||t>o)throw TypeError(`${n} must be a non-negative safe integer`);return t}function U(t,n){let o=l(t,n,64);if(!C.test(o))throw TypeError(`${n} must be a lowercase SHA-256 digest`);return o}function J(t){return T(new TextEncoder().encode(`${j(t)}
`))}function E(t,n){let o=new URL(l(t,n));if(o.protocol!=="https:"||o.username||o.password||o.search||o.hash)throw TypeError(`${n} must be an HTTPS URL without credentials, query, or fragment`);return o.toString()}function B(t,n){let o=new URL(E(t,n)),i=o.pathname.split("/").filter(Boolean);if(o.hostname.toLowerCase()!=="github.com"||o.port!==""||i.length!==6||o.pathname!==`/${i.join("/")}`||i[2]!=="releases"||i[3]!=="download"||i[4]?.toLowerCase()==="latest"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(i[4]??"")||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(i[5]??""))throw TypeError(`${n} must be an immutable GitHub Release asset URL`);return o.toString()}function An(t){let n=a(t,"compatibility");return b(n,["convax"],["convax"],"compatibility"),{convax:l(n.convax,"compatibility.convax",128)}}function Kn(t){let n=a(t,"presentation");return b(n,["name","description"],["name"],"presentation"),{name:l(n.name,"presentation.name",100),...n.description===void 0?{}:{description:l(n.description,"presentation.description",1024)}}}function dn(t){let n=a(t,"artifact delivery");if(b(n,["kind","url","size","sha256"],["kind","url","size","sha256"],"artifact delivery"),n.kind!=="artifact")throw TypeError("artifact delivery kind must be artifact");let o=z(n.size,"artifact size",134217728);if(o<1)throw TypeError("artifact size must be positive");return{kind:"artifact",url:B(n.url,"artifact URL"),size:o,sha256:U(n.sha256,"artifact sha256")}}function _o(t){let n=a(t,"marketplace descriptor");if(b(n,["schema","id","name","publisher","repository","registry","showcase","compatibility","delivery"],["schema","id","name","publisher","repository","registry","showcase","compatibility","delivery"],"marketplace descriptor"),n.schema!=="convax.marketplace/1")throw TypeError("unsupported marketplace descriptor schema");let o=l(n.id,"marketplace id",63);if(!bn.test(o))throw TypeError("invalid marketplace id");let i=a(n.publisher,"publisher");b(i,["name"],["name"],"publisher");let p=a(n.repository,"repository");b(p,["owner","name"],["owner","name"],"repository");let r=a(n.registry,"registry");b(r,["v2"],["v2"],"registry");let s=a(r.v2,"registry.v2");b(s,["url"],["url"],"registry.v2");let g=a(n.showcase,"showcase");b(g,["v2"],["v2"],"showcase");let c=a(g.v2,"showcase.v2");b(c,["url"],["url"],"showcase.v2");let e=a(n.delivery,"delivery");if(b(e,["kind"],["kind"],"delivery"),e.kind!=="github-pages-releases")throw TypeError("unsupported delivery policy");let f=l(p.owner,"repository owner",100),u=l(p.name,"repository name",100);if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(f)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(u)||u==="."||u==="..")throw TypeError("repository owner/name must be valid GitHub repository path segments");let h=(m,k)=>{let $=new URL(E(m,k)),w=`${f.toLowerCase()}.github.io`,x=$.pathname.split("/").filter(Boolean);if($.hostname.toLowerCase()!==w||$.port!==""||!$.pathname.startsWith(`/${u}/`)||$.pathname!==`/${x.join("/")}`||x.some((P)=>!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(P))||$.search)throw TypeError(`${k} must use the declared repository GitHub Pages origin`);return $.toString()};return{schema:"convax.marketplace/1",id:o,name:l(n.name,"marketplace name",100),publisher:{name:l(i.name,"publisher name",100)},repository:{owner:f,name:u},registry:{v2:{url:h(s.url,"registry.v2.url")}},showcase:{v2:{url:h(c.url,"showcase.v2.url")}},compatibility:An(n.compatibility),delivery:{kind:"github-pages-releases"}}}function Rn(t){let n=a(t,"MCP extension");if(b(n,["schema","runtime","productActions","grants"],["schema","runtime"],"MCP extension"),n.schema!=="convax.mcp-server-extension/1")throw TypeError("unsupported MCP extension schema");let o=a(n.runtime,"MCP runtime");if(b(o,["kind","command","argv","compatibility"],["kind","command","argv","compatibility"],"MCP runtime"),o.kind!=="managed-stdio")throw TypeError("MCP extension must use managed-stdio");let i=l(o.command,"MCP command",128);if(!wn.test(i)||In.test(i))throw TypeError("invalid bare MCP command");if(!Array.isArray(o.argv)||o.argv.length>32)throw TypeError("MCP argv must be a bounded array");let p=o.argv.map((u,h)=>{let m=l(u,`MCP argv[${h}]`,1024);if(m.includes("\x00"))throw TypeError("MCP argv cannot contain NUL");return m}),r=a(o.compatibility,"MCP runtime compatibility");if(b(r,["targets"],["targets"],"MCP runtime compatibility"),!Array.isArray(r.targets)||r.targets.length===0||r.targets.length>8)throw TypeError("MCP runtime must declare bounded targets");let s=r.targets.map((u)=>l(u,"MCP target",32));if(new Set(s).size!==s.length||s.some((u)=>!Pn.test(u)))throw TypeError("invalid or duplicate MCP target");let g=new Set(["canvas.import","canvas.export","project.files.read"]),c=n.productActions===void 0?void 0:(()=>{if(!Array.isArray(n.productActions)||n.productActions.length>32)throw TypeError("MCP product actions must be bounded");return n.productActions.map((u)=>{let h=a(u,"MCP product action");b(h,["action","tool"],["action","tool"],"MCP product action");let m=l(h.action,"MCP product action name",64);if(!g.has(m))throw TypeError("unsupported MCP product action");return{action:m,tool:l(h.tool,"MCP product tool",128)}})})(),e=new Set(["canvas.read","canvas.write","project.files.read"]),f=n.grants===void 0?void 0:(()=>{if(!Array.isArray(n.grants)||n.grants.length>16)throw TypeError("MCP grants must be bounded");return n.grants.map((u)=>{let h=l(u,"MCP grant",64);if(!e.has(h))throw TypeError("unsupported MCP grant");return h})})();return{schema:"convax.mcp-server-extension/1",runtime:{kind:"managed-stdio",command:i,argv:p,compatibility:{targets:s}},...c?{productActions:c}:{},...f?{grants:f}:{}}}function no(t,n){let o=a(t,"delivery");if(o.kind==="artifact"){if(n==="mcp-server")throw TypeError("MCP Server cannot use a static artifact delivery");return dn(o)}if(n!=="mcp-server")throw TypeError("only MCP Server may use MCP delivery");if(o.kind==="mcp-http"){b(o,["kind","serverJson","serverJsonSha256","runtime"],["kind","serverJson","serverJsonSha256","runtime"],"MCP HTTP delivery");let i=a(o.serverJson,"serverJson"),p=ln(i);if(p.runtime.kind!=="http-agent")throw TypeError("MCP HTTP delivery must contain HTTP definition");let r=a(o.runtime,"MCP HTTP runtime");if(b(r,["endpoint","transport"],["endpoint","transport"],"MCP HTTP runtime"),r.endpoint!==p.runtime.endpoint||r.transport!==p.runtime.transport)throw TypeError("MCP HTTP runtime does not match server.json");let s=U(o.serverJsonSha256,"serverJsonSha256");if(s!==J(i))throw TypeError("serverJsonSha256 does not match canonical server.json bytes");return{kind:"mcp-http",serverJson:i,serverJsonSha256:s,runtime:{endpoint:p.runtime.endpoint,transport:p.runtime.transport}}}if(o.kind==="mcp-managed-stdio"){b(o,["kind","serverJson","serverJsonSha256","extension","extensionSha256","companions"],["kind","serverJson","serverJsonSha256","extension","extensionSha256","companions"],"managed MCP delivery");let i=a(o.serverJson,"serverJson"),p=Rn(o.extension);if(ln(i,p),!Array.isArray(o.companions)||o.companions.length===0||o.companions.length>8)throw TypeError("managed MCP delivery must contain bounded companions");let r=o.companions.map((c)=>{let e=a(c,"companion");b(e,["target","command","url","size","sha256"],["target","command","url","size","sha256"],"companion");let f=l(e.target,"companion target",32);if(!Pn.test(f))throw TypeError("invalid companion target");let u=l(e.command,"companion command",128);if(u!==p.runtime.command)throw TypeError("companion command does not match extension");let h=z(e.size,"companion size",134217728);if(h<1)throw TypeError("companion size must be positive");return{target:f,command:u,url:B(e.url,"companion URL"),size:h,sha256:U(e.sha256,"companion sha256")}});if(new Set(r.map(({target:c})=>c)).size!==r.length)throw TypeError("duplicate companion target");if(r.some(({target:c})=>!p.runtime.compatibility.targets.includes(c)))throw TypeError("companion target is outside extension compatibility");let s=U(o.serverJsonSha256,"serverJsonSha256");if(s!==J(i))throw TypeError("serverJsonSha256 does not match canonical server.json bytes");let g=U(o.extensionSha256,"extensionSha256");if(g!==J(p))throw TypeError("extensionSha256 does not match canonical extension bytes");return{kind:"mcp-managed-stdio",serverJson:i,serverJsonSha256:s,extension:p,extensionSha256:g,companions:r}}throw TypeError("unsupported delivery kind")}function oo(t){let n=a(t,"registry package");if(b(n,["kind","id","version","compatibility","presentation","delivery","yanked","manifest","companions","ownerPluginId"],["kind","id","version","compatibility","presentation","delivery"],"registry package"),!$n.has(n.kind))throw TypeError("unsupported package kind");let o=n.kind,i=l(n.id,"package id",200);if(!Cn.test(i))throw TypeError("invalid package id");let p=l(n.version,"package version",255);if(o==="mcp-server"?!xn.test(p):!N.test(p))throw TypeError(`${o} version is unsafe or unsupported`);let r=no(n.delivery,o);if(n.yanked!==void 0&&typeof n.yanked!=="boolean")throw TypeError("yanked must be boolean");if(o==="plugin"&&n.manifest===void 0)throw TypeError("Plugin Registry package must project its manifest");if(o==="plugin"){let g=a(n.manifest,"Plugin manifest projection");if(g.schema!=="convax.plugin/8"||g.id!==i||g.version!==p){if(g.id!==i||g.version!==p)throw TypeError("Plugin manifest identity must match its Registry entry");throw TypeError("Plugin manifest schema is unsupported")}let c=a(g.hostApi,"Plugin manifest hostApi");b(c,["major","required","optional"],["major","required","optional"],"Plugin manifest hostApi");let e=/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;if(c.major!==1||!Array.isArray(c.required)||!Array.isArray(c.optional)||[...c.required,...c.optional].some((h)=>typeof h!=="string"||!e.test(h)))throw TypeError("Plugin manifest hostApi declaration is invalid");let{required:f,optional:u}=c;if(new Set(f).size!==f.length||new Set(u).size!==u.length||u.some((h)=>f.includes(h)))throw TypeError("Plugin manifest hostApi declaration contains duplicate or overlapping APIs")}if(o!=="plugin"&&n.manifest!==void 0)throw TypeError("only Plugin may project a manifest");let s=n.companions===void 0?void 0:(()=>{if(o!=="plugin"||!Array.isArray(n.companions)||n.companions.length===0||n.companions.length>16)throw TypeError("Plugin companions must be a bounded array");let g=n.companions.map((c)=>{let e=a(c,"Plugin companion");b(e,["command","version","targets"],["command","version","targets"],"Plugin companion");let f=l(e.command,"Plugin companion command",128);if(!wn.test(f)||In.test(f))throw TypeError("invalid Plugin companion command");let u=l(e.version,"Plugin companion version",255);if(!N.test(u))throw TypeError("Plugin companion version must be SemVer");if(!Array.isArray(e.targets)||e.targets.length===0||e.targets.length>16)throw TypeError("Plugin companion targets must be bounded");let h=e.targets.map((m)=>{let k=a(m,"Plugin companion target");b(k,["platform","arch","artifact"],["platform","arch","artifact"],"Plugin companion target");let $;switch(k.platform){case"darwin":case"linux":case"win32":$=k.platform;break;default:throw TypeError("invalid companion platform")}let w;switch(k.arch){case"arm64":case"x64":w=k.arch;break;default:throw TypeError("invalid companion architecture")}let x=a(k.artifact,"Plugin companion artifact");b(x,["url","size","sha256"],["url","size","sha256"],"Plugin companion artifact");let P=z(x.size,"Plugin companion size",134217728);if(P<1)throw TypeError("Plugin companion size must be positive");return{platform:$,arch:w,artifact:{url:B(x.url,"Plugin companion URL"),size:P,sha256:U(x.sha256,"Plugin companion sha256")}}});if(new Set(h.map((m)=>`${m.platform}-${m.arch}`)).size!==h.length)throw TypeError("duplicate Plugin companion target");return{command:f,version:u,targets:h}});if(new Set(g.map(({command:c})=>c)).size!==g.length)throw TypeError("duplicate Plugin companion command");return g})();if(o!=="skill"&&n.ownerPluginId!==void 0)throw TypeError("only Skill may declare ownerPluginId");if(o==="mcp-server"){let g=r.kind==="artifact"?void 0:r.serverJson;if(g?.name!==i||g.version!==p)throw TypeError("MCP registry identity must match server.json name/version")}return{kind:o,id:i,version:p,compatibility:An(n.compatibility),presentation:Kn(n.presentation),delivery:r,...n.yanked===void 0?{}:{yanked:n.yanked},...n.manifest===void 0?{}:{manifest:n.manifest},...s?{companions:s}:{},...n.ownerPluginId===void 0?{}:{ownerPluginId:l(n.ownerPluginId,"ownerPluginId",80)}}}function Wo(t){let n=a(t,"registry");if(b(n,["schema","marketplaceId","sequence","revision","packages"],["schema","marketplaceId","sequence","revision","packages"],"registry"),n.schema!=="convax.registry/2")throw TypeError("unsupported Registry schema");if(!Array.isArray(n.packages)||n.packages.length>16384)throw TypeError("Registry packages must be a bounded array");let o=n.packages.map(oo),i=new Set;for(let g of o){let c=`${g.kind}\x00${g.id}`;if(i.has(c))throw TypeError(`duplicate Registry identity ${g.kind}/${g.id}`);i.add(c)}let p=l(n.marketplaceId,"marketplaceId",63);if(!bn.test(p))throw TypeError("marketplaceId must be a lowercase Marketplace slug");let r=z(n.sequence,"sequence");if(r<1)throw TypeError("Registry sequence must be positive");let s=l(n.revision,"revision",64);if(!C.test(s))throw TypeError("Registry revision must be a 64-character lowercase content SHA-256");if(s!==T(j(o)))throw TypeError("Registry revision does not match canonical package content");return{schema:"convax.registry/2",marketplaceId:p,sequence:r,revision:s,packages:o}}function Go(t,n,o){if(o.id!==n.marketplaceId)throw TypeError("Showcase descriptor does not match Registry Marketplace");let i=a(t,"Showcase");if(b(i,["schema","marketplaceId","revision","packages"],["schema","marketplaceId","revision","packages"],"Showcase"),i.schema!=="convax.showcase/2")throw TypeError("unsupported Showcase schema");if(i.marketplaceId!==n.marketplaceId||i.revision!==n.revision)throw TypeError("Showcase source identity/revision does not match Registry");if(!Array.isArray(i.packages)||i.packages.length>n.packages.length)throw TypeError("Showcase packages must be bounded by the Registry");let p=new Map(n.packages.map((c)=>[`${c.kind}\x00${c.id}`,c])),r=new Set,s=(c,e,f,u)=>{let h=a(c,e);b(h,["url","size","sha256","mime","alt","width","height"],["url","size","sha256","mime"],e);let m=l(h.mime,`${e}.mime`,32);if(!f.has(m))throw TypeError(`${e}.mime is unsupported`);let k=z(h.size,`${e}.size`,u);if(k<1)throw TypeError(`${e}.size must be positive`);if(h.width===void 0!==(h.height===void 0))throw TypeError(`${e} dimensions must be declared together`);let $=h.width===void 0?void 0:z(h.width,`${e}.width`,8192),w=h.height===void 0?void 0:z(h.height,`${e}.height`,8192);if($===0||w===0)throw TypeError(`${e} dimensions must be positive`);let x=new URL(E(h.url,`${e}.url`)),P=`/${o.repository.owner}/${o.repository.name}/releases/download/`,L=x.pathname.slice(P.length).split("/"),W=`registry-v2-${n.revision}`;if(x.hostname.toLowerCase()!=="github.com"||x.port!==""||!x.pathname.startsWith(P)||L.length!==2||L[0]!==W||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(L[0]??"")||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(L[1]??""))throw TypeError(`${e}.url must be an immutable Registry revision Release asset in the declared repository`);return{url:x.toString(),size:k,sha256:U(h.sha256,`${e}.sha256`),mime:m,...h.alt===void 0?{}:{alt:l(h.alt,`${e}.alt`,512)},...$===void 0?{}:{width:$,height:w}}},g=i.packages.map((c)=>{let e=a(c,"Showcase package");if(b(e,["kind","id","version","presentation"],["kind","id","version","presentation"],"Showcase package"),!$n.has(e.kind))throw TypeError("unsupported Showcase package kind");let f=e.kind,u=l(e.id,"Showcase package id",200),h=l(e.version,"Showcase package version",255),m=`${f}\x00${u}`;if(r.has(m))throw TypeError(`duplicate Showcase identity ${f}/${u}`);r.add(m);let k=p.get(m);if(!k||k.version!==h)throw TypeError(`Showcase package ${f}/${u}@${h} does not match Registry`);let $=a(e.presentation,"Showcase presentation");return b($,["name","description","poster","animation"],["name","poster"],"Showcase presentation"),{kind:f,id:u,version:h,presentation:{name:l($.name,"Showcase presentation.name",100),...$.description===void 0?{}:{description:l($.description,"Showcase presentation.description",1024)},poster:s($.poster,"Showcase poster",new Set(["image/png","image/jpeg","image/webp"]),16777216),...$.animation===void 0?{}:{animation:s($.animation,"Showcase animation",new Set(["video/mp4","video/webm"]),67108864)}}}});return{schema:"convax.showcase/2",marketplaceId:n.marketplaceId,revision:n.revision,packages:g}}function Tn(t){let n=a(t,"Builtin bundle");if(b(n,["schema","release","members"],["schema","release","members"],"Builtin bundle"),n.schema!=="convax.builtin-bundle/1")throw TypeError("unsupported Builtin bundle schema");let o=a(n.release,"Builtin release");if(b(o,["id"],["id"],"Builtin release"),!Array.isArray(n.members)||n.members.length===0||n.members.length>128)throw TypeError("Builtin members must be a bounded non-empty array");let i=new Set,p=new Set,r=n.members.map((c)=>{let e=a(c,"Builtin member");if(b(e,["kind","id","version","artifact","presentation"],["kind","id","version","artifact","presentation"],"Builtin member"),e.kind!=="plugin"&&e.kind!=="skill")throw TypeError("Builtin V1 admits only Plugin and Skill");let f=($,w)=>{let x=a($,w);b(x,["path","size","sha256"],["path","size","sha256"],w);let P=l(x.path,`${w}.path`,256);if(!/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(P)||P.includes(".."))throw TypeError(`${w}.path is unsafe`);if(i.has(P))throw TypeError(`duplicate Builtin artifact path ${P}`);i.add(P);let L=z(x.size,`${w}.size`,134217728);if(L<1)throw TypeError(`${w}.size must be positive`);return{path:P,size:L,sha256:U(x.sha256,`${w}.sha256`)}},u=l(e.id,"Builtin member id",200);if(!Bn.test(u)||u.length>80)throw TypeError("Builtin member id must be a lowercase slug");let h=`${e.kind}\x00${u}`;if(p.has(h))throw TypeError(`duplicate Builtin member ${e.kind}/${u}`);p.add(h);let m=a(e.presentation,"Builtin member presentation");b(m,["poster","animation"],["poster"],"Builtin member presentation");let k=($,w)=>{let x=a($,w);b(x,["path","mime","size","sha256"],["path","mime","size","sha256"],w);let P=l(x.mime,`${w}.mime`,100);if(!(w==="Builtin poster"?new Set(["image/png","image/jpeg","image/webp"]):new Set(["video/mp4","video/webm"])).has(P))throw TypeError(`${w}.mime is unsupported`);return{...f({path:x.path,size:x.size,sha256:x.sha256},w),mime:P}};return{kind:e.kind,id:u,version:(()=>{let $=l(e.version,"Builtin member version",255);if(!N.test($))throw TypeError("Builtin member version must be SemVer");return $})(),artifact:f(e.artifact,"Builtin member artifact"),presentation:{poster:k(m.poster,"Builtin poster"),...m.animation===void 0?{}:{animation:k(m.animation,"Builtin animation")}}}}),s=(()=>{let c=l(o.id,"Builtin release id",64);if(!C.test(c))throw TypeError("Builtin release id must be a lowercase content SHA-256");return c})(),g=T(j(r));if(s!==g)throw TypeError("Builtin release id must equal the canonical member content digest");return{schema:"convax.builtin-bundle/1",release:{id:s},members:r}}function to(t,n){if(!an(t)){let f=an.errors?.[0],u=(f?.instancePath||"/").slice(0,160),h=(f?.keyword||"invalid").slice(0,64);throw TypeError(`server.json does not match the vendored official schema at ${u} (${h})`)}let o=a(t,"server.json"),i=l(o.name,"server.json.name",200);if(!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(i))throw TypeError("invalid server.json name");let p=l(o.description,"server.json.description",100),r=l(o.version,"server.json.version",255);if(!xn.test(r))throw TypeError("server.json.version is unsafe");let s=n===void 0?void 0:Rn(n);if(s){if(Array.isArray(o.remotes)&&o.remotes.length>0||Array.isArray(o.packages)&&o.packages.length>0)throw TypeError("mixed HTTP and managed-stdio profiles are forbidden");return{supported:!0,package:{id:i,version:r,definition:o,runtime:{kind:"managed-stdio",command:s.runtime.command,argv:s.runtime.argv,targets:s.runtime.compatibility.targets},extension:s}}}let c=(Array.isArray(o.remotes)?o.remotes:[]).flatMap((f)=>{let u=a(f,"server.json remote");if(u.type!=="streamable-http"&&u.type!=="sse")return[];if(u.variables!==void 0||u.headers!==void 0)return[];if(typeof u.url!=="string"||/[{}]/.test(u.url))return[];try{return[{endpoint:E(u.url,"MCP endpoint"),transport:u.type}]}catch{return[]}});if(c.length===0)return{supported:!1,id:i,version:r,definition:o,reason:"no-supported-runtime"};if(c.length>1)throw TypeError("server.json must contain exactly one supported fixed HTTPS remote");let e=c[0];return{supported:!0,package:{id:i,version:r,definition:o,runtime:{kind:"http-agent",endpoint:e.endpoint,transport:e.transport}}}}function ln(t,n){let o=to(t,n);if(!o.supported)throw TypeError("server.json must contain exactly one supported fixed HTTPS remote");return o.package}var Mn=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,io=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,po=/^(darwin|linux|win32)-(arm64|x64)$/,ro=64,K=64;function eo(t){return T(j(t))}function M(t,n){if(!t||typeof t!=="object"||Array.isArray(t))throw Error(`${n} must be an object`);return t}function H(t,n,o){let i=Object.keys(t).sort(),p=[...n].sort();if(i.length!==p.length||i.some((r,s)=>r!==p[s]))throw Error(`${o} has unsupported or missing fields`)}function q(t,n){if(typeof t!=="string"||t.length===0)throw Error(`${n} must be a non-empty string`);return t}function Z(t,n,o){let i=M(t,n);H(i,["name","sha256","size","url"],n);let p=q(i.name,`${n}.name`),r=q(i.sha256,`${n}.sha256`),s=i.size,g=q(i.url,`${n}.url`);if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(p)||!/^[a-f0-9]{64}$/.test(r)||!Number.isSafeInteger(s)||Number(s)<=0||Number(s)>o.maxSize)throw Error(`${n} must declare an immutable size and SHA-256`);let c;try{c=new URL(g)}catch{throw Error(`${n} must declare an immutable HTTPS URL`)}let e=c.pathname.split("/").filter(Boolean),f=e.indexOf("download");if(c.protocol!=="https:"||c.username||c.password||c.search||c.hash||c.hostname!=="github.com"||c.port!==""||c.pathname!==`/${e.join("/")}`||e[0]!=="microvoid"||e[1]!=="convax-plugins"||f!==3||e.length!==6||f+2>=e.length||o.expectedTag!==void 0&&e[f+1]!==o.expectedTag||e[f+1]==="latest"||e.some((u)=>u.toLowerCase()==="latest")||e.at(-1)!==p)throw Error(`${n} must declare an immutable GitHub Release HTTPS URL`);return{name:p,sha256:r,size:Number(s),url:g}}function so(t,n){if(typeof t!=="string"||!po.test(t))throw Error(`${n} must be a supported platform-architecture target`);return t}function co(t,n){let o=M(t,n);H(o,["id","kind","marketplaceId","setup","targets"],n);let i=q(o.id,`${n}.id`);if(!Mn.test(i)||o.marketplaceId!=="convax-official"||o.kind!=="plugin"||o.setup!=="automatic"||!Array.isArray(o.targets)||o.targets.length>6)throw Error(`${n} is not a valid generic automatic Plugin declaration`);let p=o.targets.map((r,s)=>so(r,`${n}.targets[${s}]`));if(new Set(p).size!==p.length)throw Error(`${n}.targets must be unique`);return{id:i,kind:"plugin",marketplaceId:"convax-official",setup:"automatic",targets:p}}function uo(t){let n=M(t,"policy");H(n,["builtin","official","preinstalledPackages","revision"],"policy");let o=M(n.builtin,"policy.builtin");H(o,["marketplaceId","repository"],"policy.builtin");let i=M(n.official,"policy.official");if(H(i,["descriptorUrl","marketplaceId","repository"],"policy.official"),o.marketplaceId!=="convax-builtin"||o.repository!=="microvoid/convax-plugins"||i.marketplaceId!=="convax-official"||i.repository!=="microvoid/convax-plugins"||i.descriptorUrl!=="https://microvoid.github.io/convax-plugins/marketplace.json"||!Number.isSafeInteger(n.revision)||Number(n.revision)<1)throw Error("policy source declarations are not the approved product policy");if(!Array.isArray(n.preinstalledPackages)||n.preinstalledPackages.length>ro)throw Error("policy.preinstalledPackages must be a bounded array");let p=n.preinstalledPackages.map((s,g)=>co(s,`policy.preinstalledPackages[${g}]`)),r=p.map((s)=>`${s.marketplaceId}\x00${s.kind}\x00${s.id}`);if(new Set(r).size!==r.length)throw Error("policy.preinstalledPackages identities must be unique");return{builtin:{marketplaceId:"convax-builtin",repository:"microvoid/convax-plugins"},official:{descriptorUrl:"https://microvoid.github.io/convax-plugins/marketplace.json",marketplaceId:"convax-official",repository:"microvoid/convax-plugins"},preinstalledPackages:p,revision:Number(n.revision)}}function ho(t){if(!Array.isArray(t)||t.length>K)throw Error("resolved.builtinReservations must be a bounded array");let n=t.map((i,p)=>{let r=M(i,`resolved.builtinReservations[${p}]`);H(r,["id","kind"],`resolved.builtinReservations[${p}]`);let s=q(r.id,`resolved.builtinReservations[${p}].id`);if(!Mn.test(s)||r.kind!=="plugin"&&r.kind!=="skill")throw Error(`resolved.builtinReservations[${p}] is invalid`);let g=r.kind;return{id:s,kind:g}}),o=n.map((i)=>`${i.kind}\x00${i.id}`);if(new Set(o).size!==o.length)throw Error("resolved.builtinReservations identities must be unique");return n}function fo(t,n,o){let i=`resolved.packages[${n}]`,p=M(t,i);if(H(p,["artifact","companions","id","kind","marketplaceId","ownedSkills","setup","version"],i),p.marketplaceId!==o.marketplaceId||p.kind!==o.kind||p.id!==o.id||p.setup!=="explicit"||!Array.isArray(p.companions)||p.companions.length>K||!Array.isArray(p.ownedSkills)||p.ownedSkills.length>K)throw Error(`${i} does not match policy.preinstalledPackages`);let r=q(p.version,`${i}.version`);if(!io.test(r))throw Error(`${i}.version must be SemVer`);let s=`plugin-${o.id}-v${r}`,g=p.companions.map((f,u)=>{let h=`${i}.companions[${u}]`,m=M(f,h);if(H(m,["arch","name","platform","sha256","size","url"],h),m.platform!=="darwin"&&m.platform!=="linux"&&m.platform!=="win32"||m.arch!=="arm64"&&m.arch!=="x64")throw Error(`${h} has an unsupported target`);let{platform:k,arch:$}=m;return{...Z({name:m.name,sha256:m.sha256,size:m.size,url:m.url},h,{maxSize:134217728,expectedTag:s}),arch:$,platform:k}}),c=g.map(({platform:f,arch:u})=>`${f}-${u}`);if(new Set(c).size!==c.length||j([...c].sort())!==j([...o.targets].sort()))throw Error(`${i}.companions must exactly close the declared policy targets`);let e=p.ownedSkills.map((f,u)=>Z(f,`${i}.ownedSkills[${u}]`,{maxSize:10485760}));if(new Set(e.map(({url:f})=>f)).size!==e.length)throw Error(`${i}.ownedSkills must be unique`);return{artifact:Z(p.artifact,`${i}.artifact`,{maxSize:10485760,expectedTag:s}),companions:g,id:o.id,kind:"plugin",marketplaceId:"convax-official",ownedSkills:e,setup:"explicit",version:r}}function Eo(t){let n=M(t,"marketplaces.lock.json");if(H(n,["policy","resolved","schema"],"marketplaces.lock.json"),n.schema!=="convax.marketplace-product-lock/1")throw Error("unsupported Marketplace product lock schema");let o=uo(n.policy),i=M(n.resolved,"resolved");H(i,["builtinBundle","builtinReservations","official","packages","policyDigest"],"resolved");let p=q(i.policyDigest,"resolved.policyDigest");if(p!==eo(o))throw Error("resolved.policyDigest does not match policy; run the explicit lock refresh");let r=M(i.official,"resolved.official");H(r,["descriptor","registry","revision","showcase"],"resolved.official");let s=q(r.revision,"resolved.official.revision");if(!/^[a-f0-9]{64}$/.test(s))throw Error("resolved.official.revision must be a 64-character lowercase content SHA-256");let g=ho(i.builtinReservations);if(!Array.isArray(i.packages)||i.packages.length!==o.preinstalledPackages.length)throw Error("resolved.packages must exactly close policy.preinstalledPackages");let c=new Map;i.packages.forEach((f,u)=>{let h=M(f,`resolved.packages[${u}]`),m=`${String(h.marketplaceId)}\x00${String(h.kind)}\x00${String(h.id)}`;if(c.has(m))throw Error("resolved.packages identities must be unique");c.set(m,{value:f,index:u})});let e=o.preinstalledPackages.map((f)=>{let u=`${f.marketplaceId}\x00${f.kind}\x00${f.id}`,h=c.get(u);if(!h)throw Error("resolved.packages must exactly close policy.preinstalledPackages");return fo(h.value,h.index,f)});return{policy:o,resolved:{builtinBundle:Z(i.builtinBundle,"resolved.builtinBundle",{maxSize:134217728}),builtinReservations:g,official:{descriptor:Z(r.descriptor,"resolved.official.descriptor",{maxSize:1048576,expectedTag:`registry-v2-${s}`}),registry:Z(r.registry,"resolved.official.registry",{maxSize:8388608,expectedTag:`registry-v2-${s}`}),revision:s,showcase:Z(r.showcase,"resolved.official.showcase",{maxSize:8388608,expectedTag:`registry-v2-${s}`})},packages:e,policyDigest:p},schema:"convax.marketplace-product-lock/1"}}var Ln=134217728,yn=125829120,go=512,mo=1048576,ko=/^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/,ao=(()=>{let t=new Uint32Array(256);for(let n=0;n<256;n++){let o=n;for(let i=0;i<8;i++)o=o&1?3988292384^o>>>1:o>>>1;t[n]=o>>>0}return t})();function lo(t){let n=4294967295;for(let o of t)n=ao[(n^o)&255]^n>>>8;return(n^4294967295)>>>0}function I(t,n,o){if(n<0||n+2>t.byteLength)throw TypeError(`Builtin ZIP ${o} is truncated`);return t.getUint16(n,!0)}function R(t,n,o){if(n<0||n+4>t.byteLength)throw TypeError(`Builtin ZIP ${o} is truncated`);return t.getUint32(n,!0)}function $o(t){let n;try{n=new TextDecoder("utf-8",{fatal:!0}).decode(t)}catch{throw TypeError("Builtin ZIP entry name is not valid UTF-8")}if(!n||n.length>256||!ko.test(n)||n.split("/").some((o)=>o===".."))throw TypeError(`Builtin ZIP entry path is unsafe: ${n}`);return n}function bo(t,n){return t<n?-1:t>n?1:0}function Hn(t,n={}){let o=n.maxTotalEntryBytes??yn;if(!Number.isSafeInteger(o)||o<1||o>yn)throw TypeError("Builtin ZIP aggregate byte budget must be a positive bounded integer");if(t.byteLength<22||t.byteLength>Ln)throw TypeError("Builtin ZIP exceeds its bounded archive size");let i=new DataView(t.buffer,t.byteOffset,t.byteLength),p=t.byteLength-22;if(R(i,p,"EOCD signature")!==101010256)throw TypeError("Builtin ZIP must end with an exact EOCD");let r=I(i,p+4,"disk"),s=I(i,p+6,"central disk"),g=I(i,p+8,"disk entry count"),c=I(i,p+10,"entry count"),e=R(i,p+12,"central size"),f=R(i,p+16,"central offset"),u=I(i,p+20,"comment length");if(r!==0||s!==0||g!==c||c<1||c>go||u!==0||f+e!==p)throw TypeError("Builtin ZIP has unsupported multi-disk, count, comment, or central-directory shape");let h=new Map,m=new Set,k=f,$=0,w="",x=0;for(let y=0;y<c;y++){if(R(i,k,"central signature")!==33639248)throw TypeError("Builtin ZIP central directory is malformed");let G=I(i,k+4,"central version made by"),S=I(i,k+6,"central version needed"),F=I(i,k+8,"central flags"),nn=I(i,k+10,"central method"),on=I(i,k+12,"central modified time"),tn=I(i,k+14,"central modified date"),pn=R(i,k+16,"central CRC"),rn=R(i,k+20,"central compressed size"),v=R(i,k+24,"central size"),D=I(i,k+28,"central name length"),en=I(i,k+30,"central extra length"),sn=I(i,k+32,"central comment length"),Fn=I(i,k+34,"central disk start"),_n=I(i,k+36,"central internal attributes"),cn=R(i,k+38,"central external attributes"),A=R(i,k+42,"local offset"),un=k+46+D+en+sn;if(G!==798||S!==20||F!==2048||nn!==0||on!==0||tn!==33||rn!==v||v>Ln||D<1||en!==0||sn!==0||Fn!==0||_n!==0||cn!==27525120&&cn!==32309248||un>p)throw TypeError("Builtin ZIP admits only bounded deterministic stored entries");let hn=t.subarray(k+46,k+46+D),_=$o(hn);if(h.has(_)||w&&bo(w,_)>=0)throw TypeError("Builtin ZIP entries must be unique and canonically ordered");let fn=_.toLocaleLowerCase("en-US");if(m.has(fn))throw TypeError("Builtin ZIP entry paths must be unique on case-insensitive filesystems");if(m.add(fn),w=_,A!==$||R(i,A,"local signature")!==67324752)throw TypeError("Builtin ZIP local records must be contiguous and match the central directory");let Wn=I(i,A+4,"local version needed"),Gn=I(i,A+6,"local flags"),vn=I(i,A+8,"local method"),Dn=I(i,A+10,"local modified time"),En=I(i,A+12,"local modified date"),Xn=R(i,A+14,"local CRC"),Qn=R(i,A+18,"local compressed size"),Yn=R(i,A+22,"local size"),Y=I(i,A+26,"local name length"),gn=I(i,A+28,"local extra length"),mn=A+30+Y+gn,O=mn+v;if(Wn!==S||Gn!==F||vn!==nn||Dn!==on||En!==tn||Xn!==pn||Qn!==rn||Yn!==v||Y!==D||gn!==0||O>f)throw TypeError("Builtin ZIP local entry metadata does not match its central entry");if(!t.subarray(A+30,A+30+Y).every((On,Vn)=>On===hn[Vn]))throw TypeError("Builtin ZIP local entry name does not match its central entry");let V=t.subarray(mn,O);if(lo(V)!==pn)throw TypeError(`Builtin ZIP CRC mismatch for ${_}`);if(x+=V.byteLength,x>o)throw TypeError("Builtin ZIP aggregate uncompressed bytes exceed the archive budget");h.set(_,V),$=O,k=un}if(k!==p||$!==f)throw TypeError("Builtin ZIP contains unindexed or trailing entry bytes");let P=h.get("bundle.json");if(!P||P.byteLength>mo)throw TypeError("Builtin ZIP must contain one bounded bundle.json");let L;try{L=JSON.parse(new TextDecoder("utf-8",{fatal:!0}).decode(P))}catch{throw TypeError("Builtin bundle.json is not valid UTF-8 JSON")}let W=Tn(L),d=new TextEncoder().encode(`${j(W)}
`);if(P.byteLength!==d.byteLength||!P.every((y,G)=>y===d[G]))throw TypeError("Builtin bundle.json must use the exact canonical JSON encoding");let Q=new Set(["bundle.json"]);for(let y of W.members){let G=[y.artifact,y.presentation.poster,...y.presentation.animation?[y.presentation.animation]:[]];for(let S of G){let F=h.get(S.path);if(!F||F.byteLength!==S.size||T(F)!==S.sha256)throw TypeError(`Builtin bundle asset does not match bundle.json: ${S.path}`);Q.add(S.path)}}if(Q.size!==h.size||[...h.keys()].some((y)=>!Q.has(y)))throw TypeError("Builtin ZIP contains assets not declared by bundle.json");return{bundle:W,entries:h}}function Oo(t,n={}){return Hn(t,n).bundle}function Vo(t,n){let{bundle:o,entries:i}=Hn(t);if(n.bundleReleaseId!==o.release.id)throw TypeError("Builtin delivery belongs to another bundle release");if(!o.members.find((s)=>s.artifact.path===n.path&&s.artifact.size===n.size&&s.artifact.sha256===n.sha256)){let s=o.members.find((g)=>g.artifact.path===n.path);throw TypeError(s?"Builtin delivery size or SHA-256 does not match its verified bundle member":"Builtin delivery path does not match a verified bundle member")}let r=i.get(n.path);if(!r)throw TypeError("Builtin delivery member bytes are missing");return r.slice()}function Jo(t,n){let o=t.members.find((i)=>i.kind===n.kind&&i.id===n.id);if(!o)throw TypeError(`Builtin bundle does not contain ${n.kind}/${n.id}`);return{kind:"builtin-artifact",bundleReleaseId:t.release.id,path:o.artifact.path,size:o.artifact.size,sha256:o.artifact.sha256}}var wo={kind:"builtin",marketplaceId:"convax-builtin",sourceInstanceId:"convax-product-builtin",policyVersion:1};function Ko(t,n){if(!t)return"add";if(t.marketplaceId!==n.marketplaceId)return"add";return t.sourceKey===n.sourceKey?"no-op":"identity-collision"}var Po=16384,Io=8388608;function jo(t){return T(j(t))}function nt(){return jo(wo)}function ot(t){return T(`mcp-server\x00${t}`)}function tt(t,n){return T(`mcp-server-version\x00${t}\x00${n}`)}function zn(t,n){return t<n?-1:t>n?1:0}function Sn(t){if(t.sourceKind==="builtin")return[0,0,t.marketplaceId];if(t.official)return[1,0,t.marketplaceId];if(t.sourceKind==="network")return[2,t.sourceOrder,t.marketplaceId];return[3,t.sourceOrder,t.marketplaceId]}function Ao(t,n){let o=Sn(t),i=Sn(n);return o[0]-i[0]||o[1]-i[1]||zn(o[2],i[2])}function it(t,n=[]){let o=new Map(n.map((p)=>[`${p.kind}\x00${p.id}`,p])),i=new Map;for(let p of t){let r=`${p.kind}\x00${p.id}`,s=i.get(r)??[];if(s.some((g)=>g.sourceKey===p.sourceKey))throw TypeError(`duplicate source item ${p.marketplaceId}/${p.kind}/${p.id}`);s.push(p),i.set(r,s)}return[...i.entries()].sort(([p],[r])=>zn(p,r)).map(([p,r])=>{let s=o.get(p),g=s?r.find((e)=>e.sourceKey===s.sourceKey):void 0,c=[...r].sort(Ao);return{identity:{kind:r[0].kind,id:r[0].id},representative:g??c[0],sources:c,requiresSourceSelection:!s&&r.length>1}})}function pt(t,n){if(!t||t.kind!==n.kind||t.id!==n.id)return"new-install";return t.sourceKey===n.sourceKey?"same-source-update":"source-conflict"}function rt(t,n){if(!Number.isSafeInteger(n.sequence)||n.sequence<1||!/^[0-9a-f]{64}$/.test(n.revision)||!/^[0-9a-f]{64}$/.test(n.catalogDigest))throw TypeError("invalid SourceSecurityState identity");if(t&&n.sequence<t.sequence)throw TypeError("source sequence rollback");if(t&&n.sequence===t.sequence){if(n.revision!==t.revision||n.catalogDigest!==t.catalogDigest||j(n.versionContracts)!==j(t.versionContracts))throw TypeError("source sequence reuse changed accepted bytes");return t}for(let[i,p]of Object.entries(n.versionContracts)){if(!/^[0-9a-f]{64}$/.test(p))throw TypeError(`invalid version contract digest for ${i}`);let r=t?.versionContracts[i];if(r&&r!==p)throw TypeError(`same version changed contract for ${i}`)}let o={...n,versionContracts:{...t?.versionContracts,...n.versionContracts}};if(Object.keys(o.versionContracts).length>Po)throw TypeError("SourceSecurityState version contract limit exceeded");if(new TextEncoder().encode(j(o)).byteLength>Io)throw TypeError("SourceSecurityState byte limit exceeded");return o}function X(t){return Buffer.from(t).toString("base64url")}var Ro=16384,qn=8192,To=300000;function Zn(t,n){if(!Number.isSafeInteger(n)||n<0)throw TypeError("invalid selection token clock");if(!t||typeof t!=="object"||Array.isArray(t))throw TypeError("invalid selection token payload");let o=t,i="artifact,catalogRevision,catalogSequence,companion,expiresAt,metadataDigest,ref,senderId,sourceKey,version";if(Object.keys(o).sort().join(",")!==i)throw TypeError("invalid selection token payload fields");if(typeof o.senderId!=="string"||o.senderId.length===0||o.senderId.length>256||!Number.isSafeInteger(o.expiresAt)||Number(o.expiresAt)<=n||Number(o.expiresAt)-n>To||!Number.isSafeInteger(o.catalogSequence)||Number(o.catalogSequence)<1||typeof o.catalogRevision!=="string"||!/^[0-9a-f]{64}$/.test(o.catalogRevision)||typeof o.version!=="string"||o.version.length===0||o.version.length>255||typeof o.sourceKey!=="string"||!/^[0-9a-f]{64}$/.test(o.sourceKey)||typeof o.metadataDigest!=="string"||!/^[0-9a-f]{64}$/.test(o.metadataDigest))throw TypeError("invalid selection token payload values");let p=o.ref;if(!p||typeof p!=="object"||Array.isArray(p))throw TypeError("invalid selection token ref");let r=p;if(Object.keys(r).sort().join(",")!=="id,kind,marketplaceId"||typeof r.marketplaceId!=="string"||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(r.marketplaceId)||typeof r.id!=="string"||r.id.length===0||r.id.length>200||!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(r.id)||r.kind!=="plugin"&&r.kind!=="skill"&&r.kind!=="mcp-server")throw TypeError("invalid selection token ref");let s=(g,c)=>{if(g===null)return null;if(!g||typeof g!=="object"||Array.isArray(g))throw TypeError(`invalid token ${c}`);let e=g,f=c==="artifact"?"sha256,size,url":"sha256,size,target,url",u;try{u=new URL(typeof e.url==="string"?e.url:"")}catch{throw TypeError(`invalid token ${c} URL`)}if(Object.keys(e).sort().join(",")!==f||u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!Number.isSafeInteger(e.size)||Number(e.size)<=0||Number(e.size)>134217728||typeof e.sha256!=="string"||!/^[0-9a-f]{64}$/.test(e.sha256)||c==="companion"&&(typeof e.target!=="string"||!/^(darwin|linux|win32)-(arm64|x64)$/.test(e.target)))throw TypeError(`invalid token ${c}`);return e};return{senderId:o.senderId,expiresAt:Number(o.expiresAt),ref:r,sourceKey:o.sourceKey,catalogSequence:Number(o.catalogSequence),catalogRevision:o.catalogRevision,version:o.version,metadataDigest:o.metadataDigest,artifact:s(o.artifact,"artifact"),companion:s(o.companion,"companion")}}function et(t,n,o=Date.now()){if(n.byteLength<32)throw TypeError("selection token secret must contain at least 32 bytes");let i=Zn(t,o),p=new TextEncoder().encode(j(i));if(p.byteLength>qn)throw TypeError("selection token payload is too large");let r=X(p),s=Un("sha256",n).update(r).digest();return`${r}.${X(s)}`}function st(t,n,o){if(typeof t!=="string"||t.length>Ro)throw TypeError("invalid selection token size");let[i,p,r]=t.split(".");if(!i||!p||r||!/^[A-Za-z0-9_-]+$/.test(i)||!/^[A-Za-z0-9_-]+$/.test(p))throw TypeError("invalid selection token");let s=Buffer.from(i,"base64url"),g=Buffer.from(p,"base64url");if(s.byteLength>qn||X(s)!==i||X(g)!==p)throw TypeError("non-canonical selection token encoding");let c=Un("sha256",o).update(i).digest(),e=g;if(e.byteLength!==c.byteLength||!xo(e,c))throw TypeError("invalid selection token signature");let f;try{f=JSON.parse(s.toString("utf8"))}catch{throw TypeError("invalid selection token JSON")}let u=Zn(f,n.now);if(u.senderId!==n.senderId)throw TypeError("selection token belongs to another sender");return u}function ct(t,n){if(t.sourceKey!==n.sourceKey||t.catalogSequence!==n.catalogSequence||t.catalogRevision!==n.catalogRevision||t.version!==n.version||t.metadataDigest!==n.metadataDigest||j(t.artifact)!==j(n.artifact)||j(t.companion)!==j(n.companion))throw TypeError("stale selection")}export{tt as versionKeyForMcpServer,st as verifySelectionToken,T as sha256Hex,Ko as resolveSourceRegistration,pt as resolveInstallConflict,Vo as readBuiltinBundleMember,Jo as projectBuiltinMemberDelivery,Go as parseShowcaseV2,ln as parseServerPackage,Wo as parseRegistryV2,Rn as parseMcpServerExtension,uo as parseMarketplaceProductPolicy,Eo as parseMarketplaceProductLock,_o as parseMarketplaceDescriptor,Oo as parseBuiltinBundleArchive,Tn as parseBuiltinBundle,et as issueSelectionToken,ot as identityKeyForMcpServer,rt as decideSourceMutation,jo as computeSourceKey,to as classifyServerPackageForCatalog,eo as canonicalProductPolicyDigest,j as canonicalJson,nt as builtinSourceKey,ct as assertSelectionCurrent,it as aggregateCatalog,Ho as OFFICIAL_SERVER_SCHEMA_URL,So as OFFICIAL_SERVER_SCHEMA_SHA256,Uo as OFFICIAL_SERVER_SCHEMA_BYTES,kn as OFFICIAL_SERVER_SCHEMA,wo as BUILTIN_SOURCE_IDENTITY};

//# debugId=F037220A2C75ECCF64756E2164756E21
//# sourceMappingURL=index.js.map
