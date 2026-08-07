import process from 'node:process'
import { generator, getConfig } from '@tanstack/router-generator'

const root = process.cwd()
const config = getConfig(
  {
    target: 'react',
    autoCodeSplitting: true,
    routesDirectory: './src/renderer/routes',
    generatedRouteTree: './src/renderer/routeTree.gen.ts',
  },
  root,
)

await generator(config, root)
