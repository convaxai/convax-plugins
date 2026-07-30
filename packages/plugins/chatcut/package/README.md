# ChatCut for Convax

ChatCut adds an offline ChatCut workspace node to Convax Canvas, imports directly
connected Canvas media through a host-staged local operation, and connects Convax
Agent sessions to ChatCut's hosted MCP server. The integration keeps video
timelines, captions, assets, and exports editable in ChatCut.

## Connection

The Plugin declares one standards-based remote MCP server:

```text
https://api.chatcut.io/api/external-mcp/mcp
```

Installing the Plugin does not grant access to a ChatCut account. Use
**Settings → Skills and Plugins → ChatCut → Connect** and complete ChatCut's
authorization flow. ChatCut owns the account and authorization decision; OpenCode
owns standard MCP OAuth discovery, token storage and refresh, connection
negotiation, tool discovery, and tool namespacing. Convax neither receives nor
stores the user's ChatCut password.

The Plugin ZIP contains no API key, OAuth token, executable, native dependency,
remote script, or ChatCut application code. Its separately resolved
`convax-chatcut-media-import-mcp` runtime exposes only the declared local
`media.import` operation; it is not the remote account connection.

## Canvas workspace

After installation, add **ChatCut** to the active Canvas from Convax's Plugin
catalog or from the Canvas insertion menu. The node provides:

- an ordered view of directly connected image, video, and audio nodes;
- an explicit **Import connected media** action;
- editable natural-language requests;
- safe starter drafts for project inspection, editing, dialogue cleanup,
  captions, and MP4 export;
- the current Convax Project and Canvas scope;
- the Agent's response in the same Canvas node.

Adding, removing, or reordering incoming edges only refreshes the pending-media
list. It never uploads automatically. Clicking **Import connected media** submits
the current Plugin node id, ordered opaque input keys, and media roles through the
narrow `agent.prompt` host capability. The Agent first resolves the ChatCut
project and timeline, then
creates a short-lived import session through the remote MCP, invokes the installed
local import operation in batches of at most four host-staged references, places
the returned assets through ChatCut's remote editing tools, and reads the project
back to verify the result.

Choosing any other starter only fills the request draft; it never starts a
mutation. The surface tells the Agent to load the owned `chatcut` Skill and to use
only the tools advertised in the current session. The iframe does not connect to
ChatCut, call the network, read media bytes, receive native paths, or receive
account credentials itself.

## Agent workflow

The Plugin owns the portable `chatcut` Skill. It requires the Agent to establish
an explicit project target, preserve direct-edge order, keep each local upload
batch to four inputs, inspect live project state before mutation, use the current
MCP tool schemas, verify writes, and export only when requested.

OpenCode derives the MCP server namespace from the installed Plugin id. Agents
must use the ChatCut tools actually advertised in the current session instead of
assuming a remembered tool list.

The remote ChatCut `import_media` session token is passed only to the installed
local import operation as bounded `toolInput`; it is never displayed by the
iframe, stored in Plugin node state, or reused as an account credential. Convax
stages only explicitly referenced inputs that are still directly connected to the
same installed ChatCut Plugin node, and rechecks their live Canvas sources before
the local call.

See [UPSTREAM.md](UPSTREAM.md) for the configuration provenance and source audit.
