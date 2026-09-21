# Trainer mode: roadmap

What the trainer does today, what landed, and what is left. The exploration
that produced this plan, its idea table, the reviewer verdicts, the per-idea
sections, the risk lines and the foundation list, lives in git history; it was
removed in `docs(trainer): roadmap-cleanup, trim the roadmap to what still
does work`. Decisions that shaped it are in
[TRAINER_DECISIONS.md](./TRAINER_DECISIONS.md).

## Where the trainer stands

- The ladder is keyed by keycode, so it is layout-agnostic. `lessonName` and
  `lessonKeyLegend` in lessons.ts derive names from the layout's legends,
  `layer: "auto"` puts azerty digits on the shifted layer, and the page, chip,
  card, indicator, toast and commandline all read them. `resolveLayoutName`
  maps "default" to the real keymap layout.
- The chip from LessonNotice.tsx names the active lesson, its best and the
  target the phase asks for; LessonResultCard.tsx prints the shortfall or the
  unlock with retry and next; the unlock toast lives in trainer/index.ts.
- Key stats keep speed apart from errors: `emaMs` takes only correct,
  non-recovery samples with pauses capped at three times the average, `errRate`
  is its own moving average, and deletes advance the clock. Shift is folded
  into the base key. `samplesFromEventLog` charges an accented char to the dead
  key, which carries the spacing, and to the base key, which carries only the
  correctness.
- `worstKeys` and `keyLabel` mark keys slow or error-prone, `worstConfusions`
  and `classifyConfusion` name the worst confusion pairs, and the weak-keys
  panel and `buildTips` show both. `prev` is on every sample and still unread.
- Unlocks read the configured floor through `criteriaFor`. `masteryOf` pools
  `perKey` over the last three attempts, so a new key needs its share of a
  60-sample budget and at most 3% errors before `unlockStatus` says ok, and the
  status carries a phase: accuracy while a new key is weak, speed once mastery
  holds. The card and the chip show only what the phase asks for.
- Lessons read real words. `largestCorpus` loads english_10k,
  `buildLessonWords` draws by damped rank when the corpus is ordered by
  frequency and never mutates a real word, the 120-word pool is weighted by
  `charWeights`, and `rebuildLessonWords` recomputes it after every finished
  lesson test. `pseudoWord` still fills gaps by alternating vowels and
  consonants.
- `startSession` in session.ts prepares any custom test from a word pool.
  `startDrill` runs 30 seconds on the three worst keys with a before and after
  notice, and never records a lesson attempt.
- The config cannot leak: lifecycle.ts sets the store before it fires the
  finished event, the persisted config hook in session.ts keeps lesson values
  out of the saved config, and index.ts scores an attempt only when
  `isLessonText` accepts the target words.
- Progress v3 stores lesson ids per layout, so a split or an inserted lesson
  never moves an unlocked position; v1 and v2 migrate through the localStorage
  hook and on backup import. It keeps 1000 attempts, at most 50 per lesson and
  layout, and a best per lesson that trimming never evicts. Key stats do the
  same. `exportBackupFile` and `importBackupFile` carry version 5: key stats,
  progress, confusions and the key history.
- The trainer page shows the lesson map, a continue button, an attempts chart
  against the configured floors, a per-lesson table and the key changes from
  `keyDeltas`. `heatColors` tints the keymap's border ring by speed or errors.

## Done

1. foundations A, session hardening. `fix(trainer): harden the lesson session
   against config changes`: the lesson survives reloads, presets and login, and
   altered text stops earning unlocks.
2. foundations B, the real layout name. `fix(trainer): resolve the default
   layout through the keymap layout`: stats and progress stop landing on qwerty.
3. trainer-page, the skeleton. `feat(trainer): add the trainer page with a
   lesson map and a shared begin action`: the /trainer route, the map and
   `beginLesson`.
4. feedback-loop, the chip. `feat(trainer): show the active lesson as a chip on
   the test screen`: a Notice over the active lesson and progress.
5. trainer-settings. `feat(trainer): add unlock strictness and words per test as
   config keys`: `trainerUnlock` and `trainerWordsPerTest` in the behavior group.
6. sample-model-v2. `feat(trainer): split key speed from error rate in key stats
   v2`: the penalty dropped, deletes advance the clock, pauses capped.
7. foundations C. `feat(trainer): foundations C, progress v2 with lesson ids and
   per-layout state`: a layout field, a larger attempt cap and backup v2.
8. mastery-and-phases, the gate. `feat(trainer): mastery-and-phases, gate
   unlocks on per-key mastery`: `masteryOf` and `unlockStatus` decide unlocks.
9. feedback-loop, the result card. `feat(trainer): feedback-loop, result card
   with retry and next`: one honest line over the reactive progress signal.
10. progress-dashboard, chart and table. `feat(trainer): progress-dashboard,
    attempts chart and lesson table`: attempts against the configured floors.
11. adaptive-words, the corpus. `feat(trainer): adaptive-words, biggest corpus
    and damped rank sampling`: english_10k and a fresh-char pass that resamples.
12. targeted-practice, the drill. `feat(trainer): targeted-practice, weak-key
    drill on a shared session`: `startSession`, `buildDrillWords`, `startDrill`.
13. file backups. `feat(trainer): export and import the backup as a file`: a
    download and a file picker instead of a commandline line.
14. layout-aware-curriculum. `feat(trainer): layout-aware-curriculum,
    legend-derived names and an auto layer`: names follow the layout.
15. curriculum-tracks, in two commits. `feat(trainer): curriculum-tracks,
    id-based progress and the capitals split` and `feat(trainer):
    curriculum-tracks, the French accents track`: capitals by hand, the
    punctuation ladder, then the accents track over a dead-key table.
16. pairwise-stats, confusions. `feat(trainer): pairwise-stats, confusion
    pairs`: a capped per-layout store, a panel row and a tip.
17. adaptive-words, weighting. `feat(trainer): adaptive-words, weak-key
    weighting and mid-lesson rebuilds`: `charWeights` and `rebuildLessonWords`.
18. mastery-and-phases, the phases. `feat(trainer): mastery-and-phases, accuracy
    phase then speed phase`: the card and the chip report one target at a time.
19. keymap-visuals. `feat(trainer): keymap-visuals, the heatmap`: `keymapHeat`
    tints the border ring. Rebuild both images with monkeybuild before the
    config PATCH accepts the key.
20. progress-dashboard, key history. `feat(trainer): progress-dashboard, key
    history and deltas`: a daily snapshot per key and "faster than last week".

## Open

- Bigram transitions. Name the slow same-finger pairs, since `prev` is on every
  sample and nothing reads it. The store has to stay per layout and capped the
  way confusions.ts is, and Space belongs in neither half of a pair.
- N-gram fillers. Build pseudo words from the corpus bigrams instead of
  alternating vowels and consonants, so a filler reads like a word. The table
  must come from the word list passed in, never from `Math.random`, or the
  seeded specs stop being deterministic.
- The picker modal. Switch lessons without leaving the test screen, from the
  chip and from a command. A command that opens a modal needs `opensModal`, or
  the commandline wipes the chain on exec.
- Warm-up and review. A zero-decision 30 second start over every unlocked
  character, and a session on the keys that went backwards. Neither may record
  a lesson attempt, and the chip stays hidden through both.
- Calendar days in history.ts. `daysBefore` subtracts a fixed day length from a
  local midnight, so the 90-day prune and the 7-day delta cutoff land a day out
  across a DST change. Subtract calendar days instead.
- The layout emulator has no dead-key state, so the French track works on the OS
  layout only. `lessonAvailable` hides it everywhere else; not planned to change.

## Working agreement

Every build-order step is run with the block below in its prompt. Later prompts
copy it verbatim.

Standing requirements, carry these into every step

- No em dashes anywhere: code, comments, commit messages, PR title and body,
  docs, and the next prompt you write.
- No code comments unless a line would be misread without one. When needed, one
  short line saying why, never what. JSDoc blocks that restate a signature count
  as comments.
- Steps 21 to 26 go on one branch from `trainer` at 40ce3b3 or later, one commit
  per step (21 is a `docs(trainer): ...`, 26 a `fix(trainer): ...`, the rest
  `feat(trainer): ...` in the style of the history), each step validated (specs,
  typecheck, lint, format, madge, headless Chromium where the step touches the
  UI) and its roadmap lines updated before the next step starts. Do not open a
  PR between steps.
- Once step 26 is committed, spawn a subagent with model opus to review the full
  branch diff against origin/trainer. Ask it to check correctness, any behaviour
  change when no lesson, drill, warm-up or review is active, missing test
  coverage, whether the trimmed roadmap still describes the code, and violations
  of the two rules above. Fix what it finds and fold each fix into the step
  commit it belongs to with `fixup!` commits and `GIT_SEQUENCE_EDITOR=: git
  rebase -i --autosquash origin/trainer`. Expect conflicts in files every step
  touches (lessons.ts, session.ts, docs/TRAINER_ROADMAP.md); resolve them per
  step rather than taking a later step's version, and set `GIT_EDITOR` to a
  command that strips comment lines so no squash message keeps a "# This is a
  combination" header. Confirm `git diff <pre-rebase tip> HEAD` is empty
  afterwards. Do this even if the diff looks small.
- Then push the branch, open one PR against trainer using
  .github/pull_request_template.md, subscribe to its activity and schedule an
  hourly check-in until it is merged or closed. When the PR is merged, stop
  iterating and say so; the next prompt is written on request. If a step is
  blocked on a decision only the user can make, say so and stop. If the PR is
  closed without merging, stop and ask.
