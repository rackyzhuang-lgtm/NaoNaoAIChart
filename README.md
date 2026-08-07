# NaoNaoAI Chat

NaoNaoAI Chat is a desktop AI client for ordinary users of the configured sub2api service. It provides local conversations and account self-service in one application for Windows, macOS, and Linux.

## Scope

- Fixed service: [naonaoai.shop](https://naonaoai.shop/)
- Desktop platforms only; iOS and Android are not supported.
- Account features include sign-in, API key management, usage summaries, channel monitoring, model plaza, announcements, and redeem history.
- Model requests use the user's sub2api API key. Panel sessions and model gateway credentials remain separate.
- Administrator controls, payment operations, arbitrary service instances, and hosted file or skill services are outside the current product scope.

## Development

Requirements: Node.js `>=22.13.0 <23` and pnpm `10.33.0`.

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Common checks:

```bash
pnpm check
pnpm lint
pnpm test
pnpm run build
pnpm test:e2e
```

The desktop E2E suite uses a temporary profile and does not call real model APIs or modify online account data.

## Packaging

`pnpm package` builds the current desktop platform. Gitee Go currently provides the Linux x64 packaging workflow in [.workflow/LinuxPackage.yml](./.workflow/LinuxPackage.yml), which produces AppImage and deb files.

Build output is written to `release/build`. The Gitee workflow uploads the filtered Linux packages as the `naonaoai-linux-x64` artifact. Packages without platform signing are for internal acceptance only.

## Documentation

- [Project status](./docs/STATUS.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Roadmap](./docs/ROADMAP.md)
- [Build and deployment](./docs/technical/build-and-deployment.md)
- [Chinese README](./doc/README-CN.md)

## License

This project is distributed under the [GPL-3.0 license](./LICENSE). Third-party notices and release obligations must be reviewed before public distribution.
