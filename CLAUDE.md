Be extremely concise. Sacrifice grammar for concision.
Frontend is partially migrated from vanilla JS to SolidJS — new components use `.tsx`, legacy code remains vanilla.
Single test file: `pnpm vitest run path/to/test.ts`
When running oxc lint, always use `--format agent`.
For typechecking, use `pnpm oxlint --type-aware --type-check` instead of `tsc`.
For styling, use Tailwind CSS, class property, `cn` utility. Do not use classlist. Only colors available are those defined in Tailwind config.
In legacy code, use `i` tags with FontAwesome classes. In new code, use `Fa` component.
In plan mode, before writing up a plan, ask clarifying questions if needed. At the end of plan mode, give me a list of unresolved questions to answer, if any. Make them concise.
This is a personal fork I maintain — no upstream PRs. Divergence from upstream (incl. `docker/`) is intentional; don't revert it or suggest keeping changes PR-clean.
Local stack runs `monkeytype/monkeytype-{frontend,backend}:trainer` images built from this repo (`monkeybuild` in `~/.zshrc`). Upstream `:latest` images are version-mismatched — never repoint compose at them.
