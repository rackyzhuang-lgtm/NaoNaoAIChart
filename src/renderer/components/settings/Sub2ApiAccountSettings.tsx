import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Checkbox,
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
import { parseSub2ApiIpcError, type Sub2ApiErrorDescriptor } from '@shared/sub2api/errors'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import {
  IconAlertCircle,
  IconArrowLeft,
  IconLogin2,
  IconLogout,
  IconRefresh,
  IconShieldLock,
  IconUserCircle,
  IconUserPlus,
} from '@tabler/icons-react'
import type { TFunction } from 'i18next'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsStore } from '@/stores/settingsStore'
import Sub2ApiAnnouncements from './Sub2ApiAnnouncements'
import Sub2ApiChannelMonitors from './Sub2ApiChannelMonitors'
import Sub2ApiKeyOnboardingModal from './Sub2ApiKeyOnboardingModal'
import Sub2ApiKeySettings from './Sub2ApiKeySettings'
import Sub2ApiRedeem from './Sub2ApiRedeem'
import Sub2ApiUsageSummary from './Sub2ApiUsageSummary'
import { hasUsableSub2ApiChatProvider } from './sub2api-provider-binding'

type AccountPhase = 'loading' | 'signed_out' | 'register' | 'two_factor' | 'signed_in' | 'error'

interface Props {
  api?: Sub2ApiRendererApi
}

function getRecoveryErrorMessage(descriptor: Sub2ApiErrorDescriptor | null, t: TFunction, fallback: string): string {
  switch (descriptor?.kind) {
    case 'session_expired':
      return String(t('Your session expired. Please sign in again.'))
    case 'network':
      return String(t('Unable to connect to the account service. Check your network and try again.'))
    case 'timeout':
      return String(t('The account service timed out. Try again.'))
    case 'rate_limited':
      return String(t('Too many requests. Wait a moment and try again.'))
    case 'feature_unavailable':
      return String(t('This account feature is not available on the service.'))
    case 'invalid_response':
      return String(t('The account service returned an invalid response. Try again.'))
    case 'service_error':
      return String(t('The account service is temporarily unavailable. Try again.'))
    default:
      return fallback
  }
}

function getSafeErrorMessage(error: unknown, t: TFunction, fallback: string): string {
  return getRecoveryErrorMessage(parseSub2ApiIpcError(error), t, fallback)
}

export default function Sub2ApiAccountSettings({ api = window.electronAPI?.sub2api }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<AccountPhase>('loading')
  const [publicSettings, setPublicSettings] = useState<Sub2ApiPublicSettings | null>(null)
  const [user, setUser] = useState<Sub2ApiUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [verificationCooldown, setVerificationCooldown] = useState(0)
  const [autoLogin, setAutoLogin] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [keyOnboardingOpened, setKeyOnboardingOpened] = useState(false)

  const completeExplicitAuthentication = useCallback((authenticatedUser: Sub2ApiUser) => {
    setUser(authenticatedUser)
    setPhase('signed_in')
    if (!hasUsableSub2ApiChatProvider(settingsStore.getState())) {
      setKeyOnboardingOpened(true)
    }
  }, [])

  const handleApiFailure = useCallback(
    (caught: unknown) => {
      const descriptor = parseSub2ApiIpcError(caught)
      if (!descriptor) {
        return
      }
      if (descriptor.kind === 'session_expired') {
        setUser(null)
        setKeyOnboardingOpened(false)
        setError(null)
        setNotice(t('Your session expired. Please sign in again.'))
        setPhase('signed_out')
        return
      }
      setError(getRecoveryErrorMessage(descriptor, t, t('Unable to load account status.')))
    },
    [t]
  )

  const accountApi = useMemo(() => {
    if (!api) {
      return undefined
    }
    return new Proxy({} as Sub2ApiRendererApi, {
      get(_target, property) {
        const value = Reflect.get(api, property)
        if (typeof value !== 'function') {
          return value
        }
        return (...args: unknown[]) =>
          Promise.resolve(value.apply(api, args)).catch((caught: unknown) => {
            handleApiFailure(caught)
            throw caught
          })
      },
    })
  }, [api, handleApiFailure])

  const verificationUnsupported = useMemo(
    () =>
      Boolean(
        publicSettings?.turnstile_enabled ||
          publicSettings?.tencent_captcha_enabled ||
          publicSettings?.aliyun_captcha_enabled
      ),
    [publicSettings]
  )

  useEffect(() => {
    if (verificationCooldown <= 0) {
      return
    }
    const timer = window.setInterval(() => {
      setVerificationCooldown((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [verificationCooldown])

  const loadAccount = useCallback(async () => {
    if (!accountApi) {
      setError(t('Account service is available in the desktop app only.'))
      setPhase('error')
      return
    }

    setError(null)
    setPhase((current) => (current === 'signed_in' ? current : 'loading'))
    try {
      const [settings, session] = await Promise.all([accountApi.getPublicSettings(), accountApi.getSessionState()])
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
        const currentUser = await accountApi.getCurrentUser()
        setUser(currentUser)
        setPhase('signed_in')
      } catch (currentUserError) {
        if (parseSub2ApiIpcError(currentUserError)?.kind === 'session_expired') {
          return
        }
        const latestSession = await accountApi.getSessionState()
        if (!latestSession.authenticated) {
          setUser(null)
          setNotice(t('Your session expired. Please sign in again.'))
          setPhase('signed_out')
          return
        }
        throw currentUserError
      }
    } catch (loadError) {
      if (parseSub2ApiIpcError(loadError)?.kind === 'session_expired') {
        return
      }
      setError(getSafeErrorMessage(loadError, t, t('Unable to load account status.')))
      setPhase((current) => (current === 'signed_in' ? current : 'error'))
    }
  }, [accountApi, t])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountApi || verificationUnsupported || busy) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await accountApi.login({ email: email.trim(), password, auto_login: autoLogin })
      setPassword('')
      if (result.status === 'two_factor_required') {
        setPhase('two_factor')
      } else {
        completeExplicitAuthentication(result.user)
      }
    } catch (loginError) {
      setError(getSafeErrorMessage(loginError, t, t('Unable to sign in. Check your email and password.')))
    } finally {
      setBusy(false)
    }
  }

  const beginRegistration = () => {
    setError(null)
    setNotice(null)
    setEmail('')
    setPassword('')
    setVerificationCode('')
    setVerificationSent(false)
    setVerificationCooldown(0)
    setPhase('register')
  }

  const returnToSignIn = () => {
    setError(null)
    setNotice(null)
    setVerificationCode('')
    setVerificationSent(false)
    setVerificationCooldown(0)
    setPhase('signed_out')
  }

  const isRegistrationEmailAllowed = (value: string): boolean => {
    const allowedSuffixes = publicSettings?.registration_email_suffix_whitelist ?? []
    if (allowedSuffixes.length === 0) {
      return true
    }
    const normalizedEmail = value.trim().toLowerCase()
    return allowedSuffixes.some((suffix) => normalizedEmail.endsWith(suffix.trim().toLowerCase()))
  }

  const handleSendRegistrationCode = async () => {
    if (!accountApi || verificationUnsupported || busy || verificationCooldown > 0) {
      return
    }
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('Please enter a valid email address.'))
      return
    }
    if (!isRegistrationEmailAllowed(normalizedEmail)) {
      setError(t('This email domain is not allowed for registration.'))
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await accountApi.sendRegistrationCode({ email: normalizedEmail })
      setVerificationSent(true)
      setVerificationCooldown(result.countdown ?? 60)
      setNotice(t('Verification code sent. Check your email.'))
    } catch (sendCodeError) {
      setError(getSafeErrorMessage(sendCodeError, t, t('Unable to send the verification code.')))
    } finally {
      setBusy(false)
    }
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountApi || verificationUnsupported || busy) {
      return
    }
    const normalizedEmail = email.trim()
    if (!isRegistrationEmailAllowed(normalizedEmail)) {
      setError(t('This email domain is not allowed for registration.'))
      return
    }
    if (password.length < 6) {
      setError(t('Password must be at least 6 characters.'))
      return
    }
    if (publicSettings?.email_verify_enabled && (!verificationSent || !/^\d{6}$/.test(verificationCode))) {
      setError(t('Enter the 6-digit email verification code.'))
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await accountApi.register({
        email: normalizedEmail,
        password,
        ...(publicSettings?.email_verify_enabled ? { verify_code: verificationCode } : {}),
      })
      if (result.status === 'authenticated') {
        setPassword('')
        setVerificationCode('')
        completeExplicitAuthentication(result.user)
      }
    } catch (registerError) {
      setError(getSafeErrorMessage(registerError, t, t('Unable to create the account.')))
    } finally {
      setBusy(false)
    }
  }

  const handleTwoFactor = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountApi || !/^\d{6}$/.test(totpCode) || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await accountApi.completeTwoFactor(totpCode)
      if (result.status === 'authenticated') {
        setTotpCode('')
        completeExplicitAuthentication(result.user)
      }
    } catch (twoFactorError) {
      setError(getSafeErrorMessage(twoFactorError, t, t('Unable to verify the code right now. Please try again.')))
    } finally {
      setBusy(false)
    }
  }

  const returnToLogin = async () => {
    if (!accountApi || busy) {
      return
    }
    setBusy(true)
    try {
      await accountApi.logout()
      setTotpCode('')
      setError(null)
      setKeyOnboardingOpened(false)
      setPhase('signed_out')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    if (!accountApi || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await accountApi.logout()
      setUser(null)
      setKeyOnboardingOpened(false)
      setPhase('signed_out')
    } catch (logoutError) {
      setError(getSafeErrorMessage(logoutError, t, t('Unable to sign out. Please try again.')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack p={{ base: 'md', sm: 'xl' }} gap="lg" maw={720}>
      {accountApi && (
        <Sub2ApiKeyOnboardingModal
          api={accountApi}
          opened={keyOnboardingOpened}
          onClose={() => setKeyOnboardingOpened(false)}
        />
      )}
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

      {(phase === 'signed_out' || phase === 'error') && (
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
          <Checkbox
            label={t('Keep me signed in')}
            checked={autoLogin}
            onChange={(event) => setAutoLogin(event.currentTarget.checked)}
          />
          <Group gap="sm">
            <Button
              type="submit"
              leftSection={<IconLogin2 size={18} />}
              loading={busy}
              disabled={!accountApi || verificationUnsupported || !email.trim() || !password}
              w="fit-content"
            >
              {t('Sign in')}
            </Button>
            {phase === 'signed_out' && publicSettings?.registration_enabled !== false && (
              <Button
                type="button"
                variant="light"
                leftSection={<IconUserPlus size={18} />}
                onClick={beginRegistration}
                disabled={busy}
              >
                {t('Register')}
              </Button>
            )}
          </Group>
        </Stack>
      )}

      {phase === 'register' && (
        <Stack component="form" onSubmit={handleRegister} gap="md" maw={440}>
          <Group justify="space-between" align="center">
            <Text fw={600}>{t('Create account')}</Text>
            <Button
              type="button"
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={17} />}
              onClick={returnToSignIn}
              disabled={busy}
            >
              {t('Back to Login')}
            </Button>
          </Group>
          {verificationUnsupported && (
            <Alert icon={<IconShieldLock size={18} />} color="yellow" title={t('Verification required')}>
              {t('This account currently requires browser verification and cannot register from the desktop app.')}
            </Alert>
          )}
          {error && (
            <Alert icon={<IconAlertCircle size={18} />} color="red">
              {error}
            </Alert>
          )}
          {notice && (
            <Alert icon={<IconAlertCircle size={18} />} color="blue">
              {notice}
            </Alert>
          )}
          <TextInput
            label={t('Email')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <PasswordInput
            label={t('Password')}
            autoComplete="new-password"
            description={t('Password must be at least 6 characters.')}
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          {publicSettings?.email_verify_enabled && (
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <TextInput
                label={t('Email verification code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                style={{ flex: 1 }}
              />
              <Button
                type="button"
                variant="light"
                onClick={() => void handleSendRegistrationCode()}
                loading={busy && !verificationSent}
                disabled={!email.trim() || verificationCooldown > 0 || busy || verificationUnsupported}
              >
                {verificationCooldown > 0 ? t('Resend in {{count}}s', { count: verificationCooldown }) : t('Send code')}
              </Button>
            </Group>
          )}
          {publicSettings?.registration_email_suffix_whitelist?.length ? (
            <Text c="dimmed" size="xs">
              {t('Allowed email domains: {{domains}}', {
                domains: publicSettings.registration_email_suffix_whitelist.join(', '),
              })}
            </Text>
          ) : null}
          <Group>
            <Button
              type="submit"
              leftSection={<IconUserPlus size={18} />}
              loading={busy && verificationSent}
              disabled={!accountApi || verificationUnsupported || !email.trim() || !password}
            >
              {t('Create account')}
            </Button>
          </Group>
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

      {phase === 'signed_in' && user && accountApi && (
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
          <Sub2ApiUsageSummary api={accountApi} />
          <Divider />
          <Sub2ApiChannelMonitors
            api={accountApi}
            availableChannelsEnabled={publicSettings?.available_channels_enabled}
            channelMonitorEnabled={publicSettings?.channel_monitor_enabled}
          />
          <Divider />
          <Sub2ApiAnnouncements api={accountApi} />
          <Divider />
          <Sub2ApiRedeem api={accountApi} user={user} onUserChange={setUser} />
          <Divider />
          <Sub2ApiKeySettings api={accountApi} />
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
