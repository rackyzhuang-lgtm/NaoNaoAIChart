export type ImmediateFollowUpOutcome = 'dismissed' | 'sent' | 'not-stopped' | 'not-sent'

export async function sendQueuedFollowUpImmediately(options: {
  confirm: () => Promise<boolean>
  pauseQueue: () => Promise<void>
  isGenerationActive: boolean
  cancelGeneration?: () => void
  waitForGenerationStop: () => Promise<boolean>
  dispatch: () => Promise<{ terminal: boolean }>
}): Promise<ImmediateFollowUpOutcome> {
  if (!(await options.confirm())) return 'dismissed'

  try {
    await options.pauseQueue()
  } catch {
    return 'not-sent'
  }

  if (options.isGenerationActive) {
    if (!options.cancelGeneration) return 'not-stopped'
    options.cancelGeneration()
    if (!(await options.waitForGenerationStop())) return 'not-stopped'
  }

  try {
    return (await options.dispatch()).terminal ? 'sent' : 'not-sent'
  } catch {
    return 'not-sent'
  }
}
