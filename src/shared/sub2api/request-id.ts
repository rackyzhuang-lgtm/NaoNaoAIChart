import { v5 as uuidv5 } from 'uuid'

/**
 * Derive a stable network request ID from one logical assistant generation.
 * A multi-step tool turn gets one deterministic ID per provider step.
 */
export function deriveSub2ApiGatewayRequestId(logicalRequestId: string, requestSequence: number): string {
  if (!logicalRequestId || !Number.isSafeInteger(requestSequence) || requestSequence < 0) {
    throw new Error('Invalid sub2api gateway request identity')
  }
  return uuidv5(`naonaoai-chat:${logicalRequestId}:${requestSequence}`, uuidv5.URL)
}
