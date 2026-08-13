import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererDir = __dirname
const sidebarSource = readFileSync(path.join(rendererDir, 'Sidebar.tsx'), 'utf8')
const productionTemplate = readFileSync(path.join(rendererDir, 'index.html'), 'utf8')
const developmentTemplate = readFileSync(path.join(rendererDir, 'index.ejs'), 'utf8')
const projectRoot = path.join(rendererDir, '../..')

function visibleSplashMarkup(template: string) {
  return template.replace(/<template id="legacy-splash-assets">[\s\S]*?<\/template>/, '')
}

describe('NaoNaoAI branding entry points', () => {
  it('uses the NaoNaoAI asset for the desktop sidebar logo', () => {
    expect(existsSync(path.join(rendererDir, 'static/icon.png'))).toBe(true)
    expect(sidebarSource).toContain("import icon from './static/icon.png'")
    expect(sidebarSource).toContain('alt="NaoNaoAI Chat logo" data-testid="app-logo"')
    expect(
      createHash('sha256')
        .update(readFileSync(path.join(rendererDir, 'static/icon.png')).toString('base64'))
        .digest('hex')
    ).toBe(
      createHash('sha256')
        .update(readFileSync(path.join(rendererDir, '../../assets/icon.png')).toString('base64'))
        .digest('hex')
    )
  })

  it.each([
    ['production HTML', productionTemplate, './static/icon.png'],
    ['development EJS', developmentTemplate, '%PUBLIC_URL%/icon.png'],
  ])('uses the NaoNaoAI asset for the %s startup splash', (_name, template, iconPath) => {
    expect(template).toContain(`src="${iconPath}"`)
    expect(template).toContain('alt="NaoNaoAI Chat logo"')
    expect(template).toContain('data-testid="splash-screen-logo"')

    const visibleMarkup = visibleSplashMarkup(template)
    expect(visibleMarkup).not.toContain('splash-screen-logo-legacy')
    expect(visibleMarkup).not.toContain('splash-screen-logo-bg')
  })

  it('keeps visible product metadata and official links on the NaoNaoAI brand', () => {
    const packageJson = readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    const builderConfig = readFileSync(path.join(projectRoot, 'electron-builder.yml'), 'utf8')
    const aboutSource = readFileSync(path.join(rendererDir, 'routes/about.tsx'), 'utf8')

    expect(packageJson).toContain('"productName": "NaoNaoAI Chat"')
    expect(builderConfig).toContain('productName: NaoNaoAI Chat')
    expect(aboutSource).toContain('https://naonaoai.shop/')
    expect([sidebarSource, productionTemplate, developmentTemplate, aboutSource].join('\n')).toContain('NaoNaoAI')
  })
})
