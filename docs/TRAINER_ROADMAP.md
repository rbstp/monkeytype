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
  blocker holding it, and opens LessonPickerModal.tsx, which lists the
  lessons of the current layout with the `lessonState` the trainer page reads.
  LessonResultCard.tsx prints the shortfall or the unlock with retry and next;
  the unlock toast lives in trainer/index.ts.
- `unlockBlocker` beside `unlockStatus` builds the one sentence naming what is
  holding a lesson: the weakest key and what it needs, or the wpm shortfall in
  the speed phase. The result card and the chip read it, and `lessonBlocker`
  beside `lessonState` feeds it to the map row and the picker row of the lesson
  being practised, and to no other row. Nothing short means no sentence, which
  the chip prints as "passed" since it holds the slot while you type. A track
  whose keys are not known yet names the accuracy floor, since it has no key to
  name.
- Key stats keep speed apart from errors: `emaMs` takes only correct,
  non-recovery samples with pauses capped at three times the average, `errRate`
  is its own moving average, and deletes advance the clock. Shift is folded
  into the base key. `samplesFromEventLog` charges an accented char to the dead
  key, which carries the spacing, and to the base key, which carries only the
  correctness.
- `worstKeys` and `keyLabel` mark keys slow or error-prone, `worstConfusions`
  and `classifyConfusion` name the worst confusion pairs, and `worstTransitions`
  and `classifyTransition` name the one-handed pairs running at least half again
  the layout's median. The weak-keys panel and `buildTips` show all three.
  `buildTips` keeps three tips and orders them accuracy, rhythm, confusion,
  keys, transition, so one slow pair no longer displaces the slowest keys.
- Unlocks read the configured floor through `criteriaFor`. `masteryOf` pools
  `perKey` over the last three attempts, so a new key needs its share of a
  sample budget and at most 3% errors before `unlockStatus` says ok, and the
  status carries a phase: accuracy while a new key is weak, speed once mastery
  holds. The card and the chip show only what the phase asks for.
  `masterySamplesFor` scales that budget with `trainerWordsPerTest` and caps it
  at what three attempts can show, since the window rolls rather than adds up.
  A table in lessons.spec.ts walks the whole ladder for every `trainerUnlock`
  crossed with the test lengths from the schema floor to its ceiling, on qwerty
  and canadian_french, so a budget that asks for more than the window can hold
  fails a spec instead of locking a lesson for good.
- Lessons read real words. `largestCorpus` loads english_10k,
  `buildLessonWords` draws by damped rank when the corpus is ordered by
  frequency and never mutates a real word, the 120-word pool is weighted by
  `charWeights`, and `rebuildLessonWords` recomputes it after every finished
  lesson test. `pseudoWord` fills the gaps by walking the `bigramTable` of the
  corpus, and falls back to alternating vowels and consonants when the allowed
  letters carry fewer than fifty pairs, which is where the home row sits, or
  when the walk dead-ends under the length floor every real word clears. The
  ladder rarely needs a filler at all, so the walk mostly serves the drill and
  the table is built on the first filler rather than on every call;
  `WordOptions.bigrams` still takes the ready table the drill passes. A word end
  counts only when the character before it is allowed too, the rule a letter
  pair already followed.
- `startSession` in session.ts prepares any custom test from a word pool, and
  its `Drill.kind` tells the three targeted sessions apart. `startDrill` runs 30
  seconds on the three worst keys, `startReview` on the unlocked keys that
  `reviewKeys` finds slow, error-prone or slower than last week, and
  `startWarmUp` over every character the unlocked lessons teach. None of them
  records a lesson attempt, shows the chip, or lets `rebuildLessonWords` run.
  `warmUpSummary` counts the distinct word indices the event log commits, not
  wpm over the clock, which measured five-character units, and not every
  `commitsWord`, since backspacing over a word boundary commits the same word
  again; the word in progress when the clock runs out was never committed, so
  it is not counted.
- The config cannot leak: lifecycle.ts sets the store before it fires the
  finished event, the persisted config hook in session.ts keeps lesson values
  out of the saved config, and index.ts scores an attempt only when
  `isLessonText` accepts the target words.
- Progress v3 stores lesson ids per layout, so a split or an inserted lesson
  never moves an unlocked position; v1 and v2 migrate through the localStorage
  hook and on backup import. It keeps 1000 attempts, at most 50 per lesson and
  layout, and a best per lesson that trimming never evicts; an import is
  trimmed to those caps as it lands, so no stored list outruns them. Key stats
  do the same. `exportBackupFile` and `importBackupFile` carry version 6: key
  stats, progress, confusions, transitions and the key history.
- An id the list cannot resolve still reads as the first lesson, since a read
  has to land somewhere, but `unlockedAfterSync` no longer writes that reading
  back. It walks the attempts from the first lesson through `unlockStatus` and
  keeps the unreadable id when they earn nothing, so a hand-edited or stale id
  is repaired to what was earned rather than reset to lesson 1. A pointer that
  resolves is still walked forward only. `syncUnlocked` runs on every
  `fullConfigChangeFinished`, on every unlock change and on a backup import, so
  it collects only the writes that replaced an unreadable id and says once per
  page load which layout and lesson the pointer landed on. An import is its own
  event: it re-arms that notice, so a blob that needs a repair is never
  imported in silence. `recordAttempt` reads an unreadable id the same way
  rather than through `indexOrFirst`, so the guarantee holds in one module
  instead of resting on the sync running first, and a pointer it rebuilds says
  so through the same notice.
- The trainer page shows the lesson map, a continue button, an attempts chart
  against the configured floors and named for the layout `progressLayout`
  resolves, a per-lesson table and the key changes from `keyDeltas`, which
  reads a cutoff `daysBefore` counts in calendar days. `heatColors` tints the
  keymap's border ring by speed or errors.

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
21. roadmap-cleanup. `docs(trainer): roadmap-cleanup, trim the roadmap to what
    still does work`: this doc, and decision 8 in the decisions doc.
22. pairwise-transitions. `feat(trainer): pairwise-transitions, name the slow
    same-finger bigrams`: a `trainerTransitions` store, a panel row, a tip and
    backup version 6.
23. adaptive-words, n-gram fillers. `feat(trainer): adaptive-words, build the
    fillers from the corpus bigrams`: `bigramTable` and a table walk in
    `pseudoWord`, shared through `WordOptions.bigrams`. It reaches the drill and
    the quota pass; the home row stays on the fallback, under fifty pairs, and
    the later lessons draw enough real words to need no filler.
24. trainer-page, the picker. `feat(trainer): trainer-page, pick a lesson from
    a modal`: LessonPickerModal.tsx behind the chip and a command, over a
    shared `lessonState`.
25. targeted-practice, warm-up and review. `feat(trainer): targeted-practice,
    a warm-up and a review beside the drill`: `startWarmUp` and `startReview`
    over a `Drill.kind`, with commands, actions and page buttons.
26. hardening, calendar days. `fix(trainer): hardening, count calendar days in
    the key history`: `daysBefore` shifts a local date instead of subtracting a
    fixed day length.
27. hardening, a reachable mastery gate. `fix(trainer): hardening, scale the
    mastery budget with the test length`: a short test no longer asks for more
    samples than its rolling window can hold.
28. unlock-integrity, a lost pointer repairs itself. `fix(trainer):
    unlock-integrity, repair a lost unlock pointer instead of resetting it`:
    `indexOrFirst` stays the fail-safe read, `unlockedAfterSync` rebuilds an
    unreadable pointer from the attempts and never persists lesson 1 over it.
29. unlock-legibility, say what is holding the lesson. `feat(trainer):
    unlock-legibility, name the blocker on the map and in the picker`:
    `unlockBlocker` is extracted from the result card and read by all three.
30. polish, the four carry-overs from #8. `fix(trainer): polish, tip order,
    a lazy bigram table, word ends and the warm-up count`: the slowest keys
    outrank the transition, the table is built on first use, a word end needs
    its neighbour allowed, and the warm-up counts committed words.
31. coverage, the cases the review named. `test(trainer): coverage, the
    layoutfluid gate, the filler floor and the warm-up sentence`: three specs,
    the two one-line fixes their asserts demanded, and the warm-up and review
    finish notices read back from headless Chromium.

32. chip-legibility, the fourth reader. `feat(trainer): chip-legibility, read
    the blocker on the test chip`: the chip drops the phase floor it was
    guessing and reads `unlockBlocker`, so the card, the map, the picker and
    the chip say one thing.

33. legibility, say where you are. `feat(trainer): legibility, name the layout
    and the repaired unlock`: the attempts chart names the layout it is drawn
    from, and a pointer rebuilt from the attempts says so once per page load
    instead of changing the map in silence.

34. honesty, the warm-up count and a local unlock invariant. `fix(trainer):
    honesty, count warm-up words once and read a lost pointer locally`: the
    warm-up counts distinct committed words and says "1 word", and
    `recordAttempt` decides for itself what an unresolvable unlock id means and
    reports the pointer it rebuilds.

35. ladder-reachability. `test(trainer): ladder-reachability, walk the ladder
    at every setting`: one table over the three unlock settings, five test
    lengths and two layouts, feeding each lesson the share of the window a real
    pool delivers, so the arithmetic step 27 fixed cannot rot.

36. carry-overs, the gaps the notes named. `fix(trainer): carry-overs, trim an
    imported list and speak up for its repair`: an import trims to the caps and
    re-arms the repair notice, the reachability table names what it never
    visited instead of counting, and the config-event sync and the single
    resolve of a `useLocalStorage` updater get the specs they were missing.

## Open

- `recordAttempt` trims the list it walks for its baseline as well as the one
  it walks for the unlock, so both read the same attempts. Only a hand-seeded
  store can outrun the caps now that an import trims, and no spec makes the two
  walks disagree; the spec fences the boundary instead.
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
- Steps 32 to 35 go on one branch from `trainer` at the merge of #9 or later,
  one commit per step (32 and 33 are `feat(trainer): ...`, 34 a `fix(trainer):
  ...`, 35 a `test(trainer): ...`), each step validated (specs, typecheck, lint,
  format, madge, headless Chromium where the step touches the UI) and its
  roadmap lines updated before the next step starts. Do not open a PR between
  steps.
- Once step 35 is committed, spawn a subagent with model opus to review the full
  branch diff against origin/trainer. Ask it to check correctness, any behaviour
  change when no lesson, drill, warm-up or review is active, missing test
  coverage, whether the roadmap still describes the code, and violations of the
  two rules above. Fix what it finds and fold each fix into the step commit it
  belongs to with `fixup!` commits and `GIT_SEQUENCE_EDITOR=: git rebase -i
  --autosquash origin/trainer`. Expect conflicts in docs/TRAINER_ROADMAP.md,
  which every step touches: resolve them per step rather than taking a later
  step's version, remembering that a fixup patch cut from the working tree
  carries later steps' lines that do not exist yet at that commit. Set
  `GIT_EDITOR` to a command that strips comment lines so no squash message keeps
  a "# This is a combination" header. Confirm `git diff <pre-rebase tip> HEAD`
  is empty afterwards. Do this even if the diff looks small.
- Then push the branch, open one PR against trainer using
  .github/pull_request_template.md, subscribe to its activity and schedule an
  hourly check-in until it is merged or closed. When the PR is merged, stop
  iterating and say so; the next prompt is written on request. If a step is
  blocked on a decision only the user can make, say so and stop. If the PR is
  closed without merging, stop and ask.
