import { useEffect, useRef } from 'react'
import { mcpController } from '@/packages/mcp/controller'
import { skillsController } from '@/packages/skills/controller'
import { settingsStore } from '@/stores/settingsStore'

type HostTool = { name: string; description: string; parameters: Record<string, unknown> }
type ExecutableMcpTool = { execute?: (input: unknown, options: unknown) => Promise<unknown> | unknown; inputSchema?: unknown }

const MAX_TOOL_RESULT_CHARS = 60_000

function stableToolName(serverId: string, toolName: string): string {
  const normalize = (value: string) => value.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 48)
  return `mcp__${normalize(serverId)}__${normalize(toolName)}`
}

function inputSchemaParameters(inputSchema: unknown): Record<string, unknown> {
  if (
    inputSchema &&
    typeof inputSchema === 'object' &&
    'jsonSchema' in inputSchema &&
    (inputSchema as { jsonSchema?: unknown }).jsonSchema &&
    typeof (inputSchema as { jsonSchema?: unknown }).jsonSchema === 'object'
  ) {
    return (inputSchema as { jsonSchema: Record<string, unknown> }).jsonSchema
  }
  return { type: 'object', additionalProperties: true }
}

function boundedValue(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value)
    return serialized.length <= MAX_TOOL_RESULT_CHARS
      ? value
      : { truncated: true, value: serialized.slice(0, MAX_TOOL_RESULT_CHARS) }
  } catch {
    return { error: 'The tool returned a non-serializable value.' }
  }
}

export function CanvasAgentBroker({ allowSkills, allowMcp }: { allowSkills: boolean; allowMcp: boolean }) {
  const skillNamesRef = useRef(new Set<string>())
  const mcpToolsRef = useRef(new Map<string, { serverName: string; toolName: string; tool: ExecutableMcpTool }>())

  useEffect(() => {
    let disposed = false
    const updateCatalog = async () => {
      const catalog: HostTool[] = []
      const enabledSkills = new Set(settingsStore.getState().skills.enabledSkillNames)
      const skills = allowSkills ? await skillsController.discoverSkills() : []
      const skillNames = new Set(skills.filter((skill) => enabledSkills.has(skill.name)).map((skill) => skill.name))
      const mcpTools = new Map<string, { serverName: string; toolName: string; tool: ExecutableMcpTool }>()

      if (skillNames.size) {
        catalog.push({
          name: 'load_skill',
          description: `Load instructions for one enabled NaoNaoAI Skill: ${[...skillNames].join(', ')}`.slice(0, 8_000),
          parameters: {
            type: 'object',
            properties: { name: { type: 'string', enum: [...skillNames] } },
            required: ['name'],
            additionalProperties: false,
          },
        })
      }

      if (allowMcp) {
        for (const [serverId, { instance, config }] of mcpController.servers) {
          for (const [toolName, tool] of Object.entries(instance.getAvailableTools())) {
            const name = stableToolName(serverId, toolName)
            if (mcpTools.has(name)) continue
            const executable = tool as unknown as ExecutableMcpTool
            mcpTools.set(name, { serverName: config.name, toolName, tool: executable })
            catalog.push({
              name,
              description: `${config.name}: ${tool.description || toolName}`.slice(0, 8_000),
              parameters: inputSchemaParameters(executable.inputSchema),
            })
          }
        }
      }

      if (disposed) return
      skillNamesRef.current = skillNames
      mcpToolsRef.current = mcpTools
      await window.electronAPI.setInfiniteCanvasHostTools(catalog)
    }
    void updateCatalog().catch(() => {
      if (!disposed) void window.electronAPI.setInfiniteCanvasHostTools([])
    })
    return () => {
      disposed = true
    }
  }, [allowMcp, allowSkills])

  useEffect(() => {
    return window.electronAPI.onInfiniteCanvasHostToolCall((request) => {
      const respond = (result: unknown) =>
        window.electronAPI.completeInfiniteCanvasHostTool({ requestId: request.requestId, result: boundedValue(result) })

      if (request.name === 'load_skill') {
        const name = typeof request.input.name === 'string' ? request.input.name : ''
        if (!skillNamesRef.current.has(name)) {
          void respond({ error: 'This Skill is not enabled for Canvas Agent.' })
          return
        }
        void skillsController
          .loadSkill(name)
          .then((skill) =>
            respond(
              skill
                ? { metadata: skill.metadata, body: skill.body.slice(0, MAX_TOOL_RESULT_CHARS) }
                : { error: 'Skill was not found.' }
            )
          )
          .catch(() => respond({ error: 'Unable to load this Skill.' }))
        return
      }

      const mcp = mcpToolsRef.current.get(request.name)
      if (!mcp || !mcp.tool.execute) {
        void respond({ error: 'This MCP tool is not enabled for Canvas Agent.' })
        return
      }
      const preview = JSON.stringify(request.input).slice(0, 2_000)
      if (!window.confirm(`Allow Canvas Agent to call MCP tool?\n\nServer: ${mcp.serverName}\nTool: ${mcp.toolName}\nArguments: ${preview}`)) {
        void respond({ error: 'The user declined this MCP tool call.' })
        return
      }
      void Promise.resolve(mcp.tool.execute(request.input, {}))
        .then((result) => respond(result))
        .catch(() => respond({ error: 'MCP tool execution failed.' }))
    })
  }, [])

  return null
}
