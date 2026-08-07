import { createFileRoute } from '@tanstack/react-router'
import Sub2ApiAccountSettings from '@/components/settings/Sub2ApiAccountSettings'

export const Route = createFileRoute('/settings/account')({
  component: RouteComponent,
})

export function RouteComponent() {
  return <Sub2ApiAccountSettings />
}
