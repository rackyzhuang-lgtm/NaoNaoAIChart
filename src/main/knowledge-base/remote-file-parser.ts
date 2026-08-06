/**
 * Compatibility entry point for historical Chatbox parser configuration.
 * Hosted file parsing is intentionally unavailable; supported parsers are
 * local and MinerU and are selected by the current knowledge-base settings.
 */
export async function parseFileRemotely(filePath: string, filename: string, mimeType: string): Promise<string> {
  void filePath
  void filename
  void mimeType
  throw new Error('Hosted remote file parsing is unavailable')
}
