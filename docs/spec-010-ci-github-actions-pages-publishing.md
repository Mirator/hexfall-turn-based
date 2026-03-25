# spec-010-ci-github-actions-pages-publishing

## Goal and scope

- Define GitHub Actions policy for publishing the game to GitHub Pages.
- Ensure deployment happens only after quality gates pass (`lint`, `test`, `build`).
- Keep local development and local build behavior unchanged.

## Decisions made (and alternatives rejected)

- Chosen: deploy on every push to `main`.
- Chosen: gate deployment with `npm run lint`, `npm test`, and `npm run build`.
- Chosen: inject Vite base path only in CI (`--base=/<repo>/`) for Pages project-site compatibility.
- Chosen: use official GitHub Pages deploy actions (`upload-pages-artifact` + `deploy-pages`).
- Chosen: keep `test:e2e` outside deployment gating for now.
- Rejected for now: manual-only deploy, tag-only deploy, and hardcoding Pages base in `vite.config.js`.

## Interfaces/types added

- Workflow file:
  - `.github/workflows/publish-pages.yml`
- Jobs:
  - `quality_build` (checkout, setup-node, `npm ci`, lint/test/build, artifact upload)
  - `deploy` (artifact deployment to Pages)
- Workflow controls:
  - trigger on push to `main`
  - concurrency group `github-pages` with in-progress cancellation
  - permissions model with `pages: write` and `id-token: write` for deploy job
- Publishing contract:
  - public site URL target `https://mirator.github.io/hexfall-turn-based/`

## Behavior and acceptance criteria

- Pushes to `main` trigger the publish workflow.
- `quality_build` must pass all gates before deployment can start.
- Build command in CI uses `npm run build -- --base=/${{ github.event.repository.name }}/`.
- Deploy job runs only after successful artifact creation from `dist/`.
- Workflow publishes to GitHub Pages environment `github-pages` and exposes deployed page URL.
- Local `npm run build` behavior remains unchanged because base path override is CI-only.

## Validation performed (tests/manual checks)

- Local preflight validation:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Workflow structure validated against current repository scripts and Vite output layout.

## Known gaps and next steps

- Add optional PR preview environments if branch-based preview hosting becomes needed.
- Consider adding `npm run test:e2e` as an additional gate once CI runtime budget is approved.
- Requires repository Pages setting to use "GitHub Actions" as source.
