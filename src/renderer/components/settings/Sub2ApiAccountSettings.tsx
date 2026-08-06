import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import type { Sub2ApiPublicSettings, Sub2ApiUser } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import {
  IconAlertCircle,
  IconLogin2,
  IconLogout,
  IconRefresh,
  IconShieldLock,
  IconUserCircle,
} from '@tabler/icons-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Sub2ApiKeySettings from './Sub2ApiKeySettings'
import Sub2ApiUsageSummary from './Sub2ApiUsageSummary'

type AccountPhase = 'loading' | 'signed_out' | 'two_factor' | 'signed_in' | 'error'

interface Props {
  api?: Sub2ApiRendererApi
}

function getSafeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }
  const message = error.message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()
  return message ? message.slice(0, 240) : fallback
}

export default function Sub2ApiAccountSettings({ api = window.electronAPI?.sub2api }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<AccountPhase>('loading')
  const [publicSettings, setPublicSettings] = useState<Sub2ApiPublicSettings | null>(null)
  const [user, setUser] = useState<Sub2ApiUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const verificationUnsupported = useMemo(
    () => Boolean(publicSettings?.turnstile_enabled || publicSettings?.tencent_captcha_enabled),
    [publicSettings]
  )

  const loadAccount = useCallback(async () => {
    if (!api) {
      setError(t('Account service is available in the desktop app only.'))
      setPhase('error')
      return
    }

    setError(null)
    setPhase('loading')
    try {
      const [settings, session] = await Promise.all([api.getPublicSettings(), api.getSessionState()])
      setPublicSettings(settings)

      if (session.twoFactorRequired) {
        setPhase('two_factor')
        return
      }
      if (!session.authenticated) {
        setUser(null)
        setPhase('signed_out')
        return
      }

      try {
        const currentUser = await api.getCurrentUser()
        setUser(currentUser)
        setPhase('signed_in')
      } catch (currentUserError) {
        const latestSession = await api.getSessionState()
        if (!latestSession.authenticated) {
          setUser(null)
          setNotice(t('Your session expired. Please sign in again.'))
          setPhase('signed_out')
          return
        }
        throw currentUserError
      }
    } catch (loadError) {
      setError(getSafeErrorMessage(loadError, t('Unable to load account status.')))
      setPhase('error')
    }
  }, [api, t])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!api || verificationUnsupported || busy) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.login({ email: email.trim(), password })
      setPassword('')
      if (result.status === 'two_factor_required') {
        setPhase('two_factor')
      } else {
        setUser(result.user)
        setPhase('signed_in')
      }
    } catch (loginError) {
      setError(getSafeErrorMessage(loginError, t('Unable to sign in. Check your email and password.')))
    } finally {
      setBusy(false)
    }
  }

  const handleTwoFactor = async (event: FormEvent) => {
    event.preventDefault()
    if (!api || !/^\d{6}$/.test(totpCode) || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.completeTwoFactor(totpCode)
      if (result.status === 'authenticated') {
        setTotpCode('')
        setUser(result.user)
        setPhase('signed_in')
      }
    } catch (twoFactorError) {
      setError(getSafeErrorMessage(twoFactorError, t('Unable to verify the code right now. Please try again.')))
    } finally {
      setBusy(false)
    }
  }

  const returnToLogin = async () => {
    if (!api || busy) {
      return
    }
    setBusy(true)
    try {
      await api.logout()
      setTotpCode('')
      setError(null)
      setPhase('signed_out')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    if (!api || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.logout()
      setUser(null)
      setPhase('signed_out')
    } catch (logoutError) {
      setError(getSafeErrorMessage(logoutError, t('Unable to sign out. Please try again.')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack p={{ base: 'md', sm: 'xl' }} gap="lg" maw={720}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <div>
          <Title order={3}>{t('NaoNaoAI Account')}</Title>
          <Text c="dimmed" size="sm" mt={4}>
            {t('Account status')}
          </Text>
        </div>
        {phase === 'signed_in' && (
          <Tooltip label={t('Refresh Account Status')}>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={t('Refresh Account Status')}
              onClick={() => void loadAccount()}
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Divider />

      {phase === 'loading' && (
        <Center mih={220}>
          <Loader size="sm" aria-label={String(t('Loading'))} />
        </Center>
      )}

      {phase === 'error' && (
        <Stack align="flex-start" gap="md">
          <Alert icon={<IconAlertCircle size={18} />} color="red" title={t('Account unavailable')} w="100%">
            {error}
          </Alert>
          <Button leftSection={<IconRefresh size={17} />} onClick={() => void loadAccount()}>
            {t('Retry')}
          </Button>
        </Stack>
      )}

      {phase === 'signed_out' && (
        <Stack component="form" onSubmit={handleLogin} gap="md" maw={440}>
          {notice && (
            <Alert icon={<IconAlertCircle size={18} />} color="yellow">
              {notice}
            </Alert>
          )}
          {verificationUnsupported && (
            <Alert icon={<IconShieldLock size={18} />} color="yellow" title={t('Verification required')}>
              {t('This account currently requires browser verification and cannot sign in from the desktop app.')}
            </Alert>
          )}
          {error && (
            <Alert icon={<IconAlertCircle size={18} />} color="red">
              {error}
            </Alert>
          )}
          <TextInput
            label={t('Email')}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <PasswordInput
            label={t('Password')}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <Button
            type="submit"
            leftSection={<IconLogin2 size={18} />}
            loading={busy}
            disabled={verificationUnsupported || !email.trim() || !password}
            w="fit-content"
          >
            {t('Sign in')}
          </Button>
        </Stack>
      )}

      {phase === 'two_factor' && (
        <Stack component="form" onSubmit={handleTwoFactor} gap="md" maw={440}>
          <Group gap="sm">
            <ThemeIcon variant="light" size={36} radius="md">
              <IconShieldLock size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600}>{t('Two-factor authentication')}</Text>
              <Text c="dimmed" size="sm">
                {t('Enter the 6-digit code from your authenticator app.')}
              </Text>
            </div>
          </Group>
          {error && (
            <Alert icon={<IconAlertCircle size={18} />} color="red">
              {error}
            </Alert>
          )}
          <TextInput
            label={t('Verification Code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(event) => setTotpCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
          />
          <Group>
            <Button type="submit" loading={busy} disabled={!/^\d{6}$/.test(totpCode)}>
              {t('Verify and Log in')}
            </Button>
            <Button variant="subtle" color="gray" onClick={() => void returnToLogin()} disabled={busy}>
              {t('Back to Login')}
            </Button>
          </Group>
        </Stack>
      )}

      {phase === 'signed_in' && user && api && (
        <Stack gap="lg">
          {error && (
            <Alert icon={<IconAlertCircle size={18} />} color="red">
              {error}
            </Alert>
          )}
          <Group gap="md" align="center">
            <Avatar size={48} radius="md" color="chatbox-brand">
              <IconUserCircle size={28} />
            </Avatar>
            <div>
              <Group gap="xs">
                <Text fw={600} size="lg">
                  {user.username}
                </Text>
                <Badge color={user.status === 'active' ? 'green' : 'gray'} variant="light">
                  {t(user.status === 'active' ? 'Active' : 'Disabled')}
                </Badge>
              </Group>
              <Text c="dimmed" size="sm">
                {user.email}
              </Text>
            </div>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
            <div>
              <Text size="xs" c="dimmed">
                {t('Balance')}
              </Text>
              <Text fw={600}>{user.balance}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                {t('Concurrency')}
              </Text>
              <Text fw={600}>{user.concurrency}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                {t('Run mode')}
              </Text>
              <Text fw={600}>{user.run_mode ?? t('Unknown')}</Text>
            </div>
          </SimpleGrid>

          <Divider />
          <Sub2ApiUsageSummary api={api} />
          <Divider />
          <Sub2ApiKeySettings api={api} />
          <Divider />
          <Button
            variant="light"
            color="red"
            leftSection={<IconLogout size={18} />}
            loading={busy}
            onClick={() => void handleLogout()}
            w="fit-content"
          >
            {t('Sign out')}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
