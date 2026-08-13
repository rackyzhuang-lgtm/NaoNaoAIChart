import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererDir = __dirname

function readRendererSource(relativePath: string) {
  return readFileSync(path.join(rendererDir, relativePath), 'utf8')
}

describe('visible product entry points', () => {
  it('does not expose the legacy image creator from the sidebar, shortcut, or legacy picture session', () => {
    const sidebarSource = readRendererSource('Sidebar.tsx')
    const shortcutSource = readRendererSource('hooks/useShortcut.tsx')
    const inputBoxSource = readRendererSource('components/InputBox/InputBox.tsx')

    expect(sidebarSource).not.toContain('new-image-button')
    expect(sidebarSource).not.toContain("t('Create Image')")
    expect(sidebarSource).not.toContain("navigate({ to: '/image-creator' })")
    expect(shortcutSource).not.toContain('shortcuts.newPictureChat')
    expect(shortcutSource).not.toContain("to: '/image-creator'")
    expect(inputBoxSource).not.toContain("navigate({ to: '/image-creator' })")
    expect(inputBoxSource).not.toContain("t('Go to Image Creator')")
  })

  it('keeps only the official product link on the About page', () => {
    const aboutSource = readRendererSource('routes/about.tsx')

    expect(aboutSource).toContain('https://naonaoai.shop/')
    expect(aboutSource).not.toContain("title={t('Github')}")
    expect(aboutSource).not.toContain('gitee.com/ribbog77/nao-nao-aichart')
    expect(aboutSource).not.toContain("import BrandGithub from '@/components/icons/BrandGithub'")
  })
})
