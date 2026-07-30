import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const binary = path.resolve(process.argv[2] ?? path.join(import.meta.dir, "..", "dist", "convax-cutout-mcp"))
const root = await mkdtemp(path.join(os.tmpdir(), "convax-cutout-smoke-"))
const retainedOutput = process.env.CONVAX_CUTOUT_SMOKE_OUTPUT_DIRECTORY
const outputDirectory = retainedOutput ? path.resolve(retainedOutput) : path.join(root, "output")
const suppliedInput = process.env.CONVAX_CUTOUT_SMOKE_INPUT
const inputPath = suppliedInput ? path.resolve(suppliedInput) : path.join(root, "input.png")
const tinyPNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAfPpQ1QAAAAASUVORK5CYII=",
  "base64",
)

await mkdir(outputDirectory)
if (!suppliedInput) await writeFile(inputPath, tinyPNG)

const processHandle = Bun.spawn([binary], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
})
const reader = processHandle.stdout.getReader()
const decoder = new TextDecoder()
let buffer = ""

async function responseFor(id: number) {
  while (true) {
    const newline = buffer.indexOf("\n")
    if (newline >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.trim()) continue
      const value = JSON.parse(line) as { id?: unknown }
      if (value.id === id) return value as Record<string, unknown>
      continue
    }
    const chunk = await reader.read()
    if (chunk.done) throw new Error(`Cutout companion exited before response ${id}`)
    buffer += decoder.decode(chunk.value, { stream: true })
  }
}

function send(value: unknown) {
  processHandle.stdin.write(`${JSON.stringify(value)}\n`)
}

try {
  send({
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: { protocolVersion: "2025-03-26" },
  })
  const initialized = await responseFor(1)
  if ((initialized.result as { serverInfo?: { name?: string } })?.serverInfo?.name !== "convax-cutout-mcp") {
    throw new Error("Cutout companion returned invalid server metadata")
  }
  send({ id: 2, jsonrpc: "2.0", method: "tools/list", params: {} })
  const tools = (await responseFor(2)).result as { tools?: Array<{ name?: string }> }
  if (tools.tools?.length !== 1 || tools.tools[0]?.name !== "background.remove") {
    throw new Error("Cutout companion did not expose the reviewed tool")
  }
  send({
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        operation_id: "smoke-cutout",
        output: "image",
        output_directory: outputDirectory,
        prompt: "Remove the background.",
        references: [{
          kind: "file",
          mime_type: "image/png",
          name: path.basename(inputPath),
          node_id: "smoke-node",
          path: inputPath,
          role: "reference_image",
        }],
        schema: "convax.generation-call/1",
      },
      name: "background.remove",
    },
  })
  const result = (await responseFor(3)).result as {
    isError?: boolean
    structuredContent?: { artifacts?: Array<{ mimeType?: string; path?: string }>; schema?: string }
  }
  if (
    result.isError ||
    result.structuredContent?.schema !== "convax.generation-result/1" ||
    result.structuredContent.artifacts?.[0]?.mimeType !== "image/png" ||
    result.structuredContent.artifacts[0]?.path !== "cutout.png"
  ) {
    throw new Error(`Cutout companion did not return a valid generation artifact: ${JSON.stringify(result)}`)
  }
  const output = await readFile(path.join(outputDirectory, "cutout.png"))
  if (!output.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("Cutout companion output is not a PNG")
  }
  console.log(
    retainedOutput
      ? `Cutout companion local inference smoke passed: ${path.join(outputDirectory, "cutout.png")}`
      : "Cutout companion local inference smoke passed.",
  )
} finally {
  processHandle.stdin.end()
  await processHandle.exited
  await reader.cancel().catch(() => undefined)
  await rm(root, { force: true, recursive: true })
}
