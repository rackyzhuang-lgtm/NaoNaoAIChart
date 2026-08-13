import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('launches the branded desktop shell and opens the account setup entry', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'naonaoai-e2e-'))
  const mainEntry = path.resolve(__dirname, '../../release/app/dist/main/main.js')
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | undefined

  try {
    electronApp = await electron.launch({
      args: [mainEntry, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        CHATBOX_DISABLE_GPU: '1',
        E2E_TEST: '1',
        NODE_ENV: 'production',
      },
    })
    const window = await electronApp.firstWindow()
    await expect(window).toHaveTitle('NaoNaoAI Chat')
    await expect(window.getByTestId('splash-screen-logo')).toHaveAttribute('src', /icon\./)
    await expect(window.getByTestId('splash-screen-logo')).toHaveAttribute('alt', 'NaoNaoAI Chat logo')
    await expect(window.getByText('NaoNaoAI Chat', { exact: true }).first()).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('app-logo')).toHaveAttribute('alt', 'NaoNaoAI Chat logo')
    await window.getByTestId('account-center-button').click()
    await expect(window.getByRole('heading', { name: 'NaoNaoAI Account', exact: true }).first()).toBeVisible()
    await expect(window.locator('body')).not.toContainText('Chatbox AI')
  } finally {
    try {
      await electronApp?.close()
    } finally {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  }
})
