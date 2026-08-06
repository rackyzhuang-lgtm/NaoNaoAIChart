import type { HomeWelcomeCardMode } from '@/utils/homeWelcomeCard'

/**
 * The upstream welcome card promoted Chatbox-owned plans and login endpoints.
 * NaoNaoAI keeps the component boundary for persisted layout compatibility but
 * does not render or call the removed upstream service.
 */
export function ChatboxWelcomeCard(_props: { mode: HomeWelcomeCardMode; pageName: string; className?: string }) {
  return null
}
