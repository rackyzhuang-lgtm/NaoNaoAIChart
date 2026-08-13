import { describe, expect, it } from 'vitest'
import { AgentApprovalPolicySchema, isFullAccessPolicy, resolveAgentApprovalPolicy } from './agent-approval-policy'

describe('agent approval policy', () => {
  it('accepts the three supported policies', () => {
    expect(AgentApprovalPolicySchema.options).toEqual(['ask', 'risk', 'full'])
  })

  it('maps legacy full access sessions without overriding an explicit policy', () => {
    expect(resolveAgentApprovalPolicy({ agentFullAccess: true })).toBe('full')
    expect(resolveAgentApprovalPolicy({ agentFullAccess: false })).toBe('ask')
    expect(resolveAgentApprovalPolicy({ agentApprovalPolicy: 'risk', agentFullAccess: true })).toBe('risk')
    expect(isFullAccessPolicy({ agentApprovalPolicy: 'full' })).toBe(true)
  })
})
