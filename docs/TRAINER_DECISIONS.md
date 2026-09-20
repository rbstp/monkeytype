# Trainer mode: decisions

Settled 2026-09-20 after the expansion exploration in [TRAINER_ROADMAP.md](./TRAINER_ROADMAP.md). Each answer changes what gets built and in which order.

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | Commandline only, or a trainer page? | **Give the trainer a page.** | `/trainer` is the home for the lesson map, the picker, the attempts chart and the per-lesson table. The commandline keeps its commands but calls the same shared actions. The lesson chip on the test screen opens the page. |
| 2 | Local only with export, or account sync? | **Local only.** The stack runs in local Docker. | `account-sync` is dropped. Export and import stay the safety net, so they move from a single-line commandline input to a file download and a file picker. The trainer tag on results is not needed. |
| 3 | Which layout? | **Default (OS layout) for now. canadian_french is the second goal.** | Foundations must stop mapping `default` to `qwerty` so stats and progress land on the real layout later. Lesson names become legend-derived. The French track needs a dead-key table since the layout JSON has none. |
| 4 | Keep the 97% and 30 wpm bar, relax it, make it a setting, or per-key mastery? | **Make it a setting.** | `trainerUnlock` (relaxed / normal / strict) and `trainerWordsPerTest` become Config keys in the behavior group. Per-key mastery lands later as a gate on top of the chosen floor, not instead of it. |
| 5 | Schema bumps with migration, or additive only? | **Schema bumps are fine.** | Progress v2 (lesson ids, layout field, per-layout current and unlocked, larger attempt cap), key stats v2 (speed and error rate split), backup v2 that migrates on import. All through the existing `migrate` hook. |
| 6 | Celebration, daily goal and streak, or honest numbers? | **Honest numbers.** | The result card says "27 wpm, 3 short of 30" with retry and next. No confetti, no streaks, no daily goal. The unlock toast stays. |
| 7 | After the letters: quotes, code, or French accents? | **French accents.** | The curriculum track after lesson 12 is French: `é ç` on direct keys, then `è à ù` through the grave dead key, `ê â î ô û` through the circumflex, `ë ï ü` through the diaeresis. Quotes and code tracks are not planned. |

## What the decisions drop

- `account-sync` in all three stages.
- Celebration flow, daily goal and streak from `feedback-loop`.
- Quotes and code tracks from `curriculum-tracks`.
- keybr-style confidence-driven key introduction, already dropped by the exploration.

## Notes on Progress v2

- v1 progress had no layout field. The migration files every v1 attempt, current and unlocked under `qwerty`, because it runs when the module loads and the config is not available yet. A v1 user on another layout keeps the history in the qwerty bucket and starts that layout fresh; re-typing a lesson is cheaper than guessing.

## Notes on the French goal

- canadian_french has four layers per key: unshifted, shift, AltGr, shift + AltGr. `findLayoutKey` already returns the layer, and `keycodeToLayoutKey` reads any layer.
- Only `é` and `ç` are direct legends. `è à ù ê â î ô û ë ï ü` come from dead keys: grave on the backquote key, circumflex on the key left of the backspace row, diaeresis on the shifted cedilla key. The layout JSON carries no dead-key information, so the trainer needs its own table mapping an accented char to the dead keycode plus the base keycode.
- When the OS handles the layout, the browser delivers the accented char as one input event after the dead-key sequence. The sampler must attribute that char to two keypresses and the spacing to the pair.
- The layout emulator has no dead-key state, so the French track only works with the OS layout, which matches decision 3.
