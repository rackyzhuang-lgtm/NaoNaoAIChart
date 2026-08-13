import { z } from 'zod'

export const AgentApprovalPolicySchema = z.enum(['ask', 'risk', 'full'])
export type AgentApprovalPolicy = z.infer<typeof AgentApprovalPolicySchema>

type ApprovalSettings = {
  agentApprovalPolicy?: AgentApprovalPolicy
  agentFullAccess?: boolean
}

/** Resolve the new policy while keeping sessions written before 0059 readable. */
export function resolveAgentApprovalPolicy(settings?: ApprovalSettings): AgentApprovalPolicy {
  if (settings?.agentApprovalPolicy) return settings.agentApprovalPolicy
  return settings?.agentFullAccess === true ? 'full' : 'ask'
}

export function isFullAccessPolicy(settings?: ApprovalSettings): boolean {
  return resolveAgentApprovalPolicy(settings) === 'full'
}
