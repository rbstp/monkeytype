# Trainer mode: expansion roadmap

Result of a multi-lens exploration on 2026-09-20: six lenses proposed ideas, an editor merged them into a 14-idea shortlist, and each idea was verified against the code by an adversarial reviewer. The order at the end reflects the choices in [TRAINER_DECISIONS.md](./TRAINER_DECISIONS.md). File references point at the code as of commit 7216f39.

## Where the trainer stands

Strengths:

- Lessons are keyed by keycode, so the ladder is layout-agnostic; `lessonLegends` already derives legends.
- Session snapshot and restore survives reloads and mutes its own config writes.
- Key stats are per layout in zod-validated localStorage with a migrate hook available.
- The event log already holds typed char, correctness, position, commits and deletes.
- Unlocks use the result-screen numbers, re-evaluate on load, and every attempt stores per-key counts. Pure, seeded builders have specs.

Gaps:

- The chip at LessonNotice.tsx names the active lesson, its best and the target on the test screen; the result card at LessonResultCard.tsx prints the shortfall or the unlock with retry and next. The unlock toast in trainer/index.ts stays.
- Key stats v2 keeps speed apart from errors: emaMs takes only correct, non-recovery samples with pauses capped at three times the average, errRate is its own moving average, and deletes advance the clock. Shift is still folded into the base key in key-stats.ts; an accented char typed through a dead key counts for the dead key, which carries the spacing, and the base key since the French track. Panel and tips label keys slow or error-prone, and name the worst confusion pairs since pairwise-stats.
- Unlocks read the configured floor through criteriaFor and, since the mastery gate, `masteryOf` in lessons.ts pools perKey over the last three attempts: a new key needs its share of a 60-sample budget (20 for a two-key lesson, 4 for capitals left, 6 for capitals right) and at most 3% errors before `unlockStatus` says ok. Since step 18 the status carries a phase: accuracy while a new key is weak, speed once mastery holds, and the card and the chip show only what that phase asks for.
- Early lessons read real words since the adaptive-words slice: `largestCorpus` in session.ts loads english_10k, `buildLessonWords` draws by damped rank when the corpus is ordered by frequency and never mutates a real word. Since step 17 the 120-word pool is weighted by `charWeights` and rebuilt after every finished lesson test through `rebuildLessonWords`.
- Lesson names follow the layout since layout-aware-curriculum: `lessonName` in lessons.ts joins the fresh legends for the lessons whose name is their qwerty legends and keeps the fixed names, `lessonKeyLegend` resolves the numbers through `layer: "auto"`, and every surface (page, chip, card, indicator, toast, commandline) reads it. "default" resolves through keymapLayout in utils/layout-name.ts, and progress is per layout since Progress v2: `progressLayout()` in lessons.ts names the entry that `currentLesson()`, `unlockedUpTo()` and `bestOf()` read.
- Config leaks, closed by foundations A: lifecycle.ts sets the store before it fires the finished event, the persisted config hook in session.ts keeps lesson values out of the saved config, and index.ts scores an attempt only when isLessonText accepts the target words.
- Progress v3 keeps lesson ids for current and unlocked, so a split or an inserted lesson never moves an unlocked position; v1 and v2 migrate through the localStorage hook and on backup import. Progress keeps 1000 attempts with at most 50 per lesson and layout, and stores a best per lesson so trimming never evicts one. Key stats do the same since key stats v2. The backup travels as a file: `exportBackupFile` and `importBackupFile` in trainer/actions.ts, wired to the trainer page header and the two commandline commands.

## Expansion ideas

Value is 1 to 5 for a self-taught touch typist on this fork. Effort is S, M, L or XL. The verdict is the reviewer's after reading the code.

| id | idea | value | effort | verdict | depends on |
|---|---|---|---|---|---|
| adaptive-words | Bigger corpus, Zipf, weak-key weighting, n-gram fillers | 5 | M | strong | none |
| feedback-loop | Lesson chip, result card | 5 | L | strong | none |
| sample-model-v2 | Motor time vs think time vs errors | 4 | M | strong | foundations |
| mastery-and-phases | Per-key mastery gate, then phases | 4 | M | good | sample-model-v2 |
| targeted-practice | Weak-key drill, warm-up, review | 4 | M | good | foundations |
| trainer-page | /trainer page, lesson map, picker | 4 | M | good | none |
| pairwise-stats | Confusion pairs, bigram transitions | 4 | L | strong | sample-model-v2, targeted-practice |
| progress-dashboard | Attempts chart, lesson table, key history | 4 | L | good | trainer-page |
| curriculum-tracks | Capitals by hand, punctuation ladder, French accents | 4 | XL | good | foundations, sample-model-v2, layout-aware-curriculum |
| foundations | Session hardening, layout resolution, migrate | 3 | M | good | none |
| layout-aware-curriculum | Legend names, auto layer, per-layout progress | 3 | M | good | foundations |
| keymap-visuals | Per-key heatmap on the keymap | 3 | M | good | none |
| trainer-settings | Words per test, unlock strictness as Config | 3 | M | good | foundations |
| account-sync | Trainer tag, then a sync endpoint | 3 | L | good, dropped by decision 2 | sample-model-v2 |

Dropped by the exploration: keybr-style confidence-driven key introduction, since mastery plus review plus weighting already give that loop.

### Adaptive drill text

Lesson 2 reads "is as all if see like", not "ask sajil eseke". Each test chases current weaknesses.

The corpus swap lives in the language load in session.ts; Zipf is gated on orderedByFrequency because French lists are alphabetical. Weights belong in the 120-word pool, and rebuilds must go through applyCustomText. The reviewer split it into three slices and moved weighting after sample-model-v2.

First slice landed in `feat(trainer): adaptive-words, biggest corpus and damped rank sampling`: biggest corpus, damped rank sampling with weight 1 / (rank + 10) ^ 0.6, pool of 120, word-initial capitals for the capitals lesson, and a fresh-char pass that resamples a real word instead of mutating one.

Second slice landed in `feat(trainer): adaptive-words, weak-key weighting and mid-lesson rebuilds`: `WordOptions.weights` multiplies the rank weight by the mean character weight of a word (an unordered, unweighted list still draws uniformly), `charWeights` in trainer/weights.ts gives a key with at least five samples 1 plus five times its error rate plus how far its emaMs sits above the layout median (capped at 2), 1 otherwise, and shifted legends share the key's weight. `rebuildLessonWords` in session.ts recomputes the active lesson's pool with the current stats and applies it through applyCustomText only while no test runs and never during a drill; onTestFinished calls it after recordSamples for an active lesson on the test page, so the next restart chases today's weak keys. N-gram fillers are still open.

Risk, resolved: the fresh-char pass now resamples; only pseudo words are still mutated.

### Lesson feedback loop

A chip reads "lesson 3: r u · best 28 · target 30 / 97%". The result screen says "27 wpm, 3 short" with retry and next.

The chip is a Notice over the reactive getActiveLesson and progress signals; "trainer" joins the closed CommandlineListKey union. The card mounts beside the weak-keys panel and must read reactive progress, since recordAttempt is async. Celebration, daily goal and streak are out by decision 6.

First slice landed: the chip alone, a Notice over getActiveLesson and progress that opens /trainer, no new state. The result card landed in `feat(trainer): feedback-loop, result card with retry and next`: one line from unlockStatus over the reactive progress signal, retry through restartTestEvent, next through beginLesson, disabled while locked, and "attempt not recorded" when the last attempt predates the result.

Risk: a second full-width panel crowds the result page.

### Sample model v2

Weak keys stop being hijacked by a coffee break or a word's first letter. Keys are labelled slow or error-prone.

Sampler on input events only: advance the clock on deletes, flag recovery, cap spacing at three times the EMA, drop the penalty, track error rate separately. Backspace and shift have no keydown events, so the reviewer cut keydown pairing, hold time and per-key think time. Migrate v1 through the existing hook.

First slice landed: key-stats.ts v2 splits emaMs from errRate, drops the penalty, advances the clock on deletes, flags recoveries and caps pauses; v1 migrates through the localStorage hook and on backup import. Shifted keys still share the base key's stat.

Risk: splitting shifted keys thins samples; gate labels on counts.

### Mastery gate and phases

A lesson unlocks when its new keys are mastered, not when old keys mask weak ones. A failed attempt says what is missing.

perKey is recorded per attempt and never read. Pool the last three attempts, require 20 fresh samples and at most 3% fresh errors, keep the configured floors. The reviewer showed a 95% Wilson bound is unreachable at 15 samples, so use plain counts; a per-key minAcc was cut because failed tests are never recorded.

First slice landed in `feat(trainer): mastery-and-phases, gate unlocks on per-key mastery`: masteryOf and unlockStatus wired into canUnlock, syncUnlocked and recordAttempt, plain counts, capitals pool shifted samples only, and `masterySamplesFor` scales the requirement with the lesson width so capitals asks 3 samples per letter instead of 20. The shortfall notice arrives with the result card in build-order step 9.

Second slice landed in `feat(trainer): mastery-and-phases, accuracy phase then speed phase`: `unlockStatus` gains `phase`, accuracy while any new key is below its samples or above the error bar and speed once mastery holds. The floors do not change and no state is added; the wpm shortfall is reported only in the speed phase, so the card reads "accuracy phase: k errs 6%, bar 3%" or "accuracy phase: k needs 12 more samples", then "speed phase: 27 wpm, 3 short of 30", and the chip shows only the target that applies to the phase.

Risk, resolved: the shortfall copy lives on the result card since build-order step 9.

### Targeted practice

A drill button runs 30 seconds on your three slowest keys with before and after. Warm-up is a zero-decision start.

startLesson is thin glue, so a general startSession is mechanical. The reviewer cut SM-2 and the every-third-continue hijack, and found two blockers: section limits under 10 are invalid, and tests under 75% accuracy discard samples. Pass a finer samplesUsable flag from test-logic.

First slice landed in `feat(trainer): targeted-practice, weak-key drill on a shared session`: `startSession` in session.ts with startLesson as glue, `buildDrillWords` and `startDrill` in drill.ts, the "Trainer: drill weak keys" command through `beginDrill` in actions.ts, a 30 second time limit, an `activeDrill` signal that keeps lesson attempts, the chip and the card away, one notice with before and after emaMs per key, and `samplesUsable` on FinishedTest so an accuracy-only invalidation still records key samples. Warm-up and review are still open.

Risk, resolved: drill.ts imports session.ts and key-stats only; madge stays clean.

### Trainer page

A lesson map shows legends, state and best per lesson, plus a continue button. Switching lessons leaves the commandline.

Plumbing mirrors every SolidJS page: PageName union, solidPage, route, index.html container, mount key, nav button. nginx already serves any path. Starting a lesson is startLesson then navigate, since the test page restarts on show. Bests need a new progress field; the 100-attempt cap evicts them. The reviewer cut the intro modal, the mobile row and the keytip.

First slice, landed in `feat(trainer): add the trainer page with a lesson map and a shared begin action`: `/trainer` route, nav button, a "Trainer: open page" command, a lesson map with legends, state and a best derived from the stored attempts whose unlocked rows start the lesson, a continue button, and `beginLesson` in trainer/actions.ts shared with the commandline. The per-lesson best field landed with Progress v2 in `feat(trainer): foundations C, progress v2 with lesson ids and per-layout state`. The attempts chart and the per-lesson table landed with build-order step 10, export and import buttons with step 13. Still to come: the picker modal.

Risk: commandline exec wipes a chained modal unless opensModal is set.

### Confusion pairs and transitions

"You press k when you mean d, mirror hand" replaces "88% on d". Slow same-finger bigrams get named.

Insert events carry the typed char, so adding typed and prev to samples is 15 lines. Dedupe wrong samples per position so stop-on-error retries count once. Hand must come from finger; the side sets in constants/keys.ts overlap. The reviewer killed write-time pruning; use caps, decay and read-time minimums.

First slice landed in `feat(trainer): pairwise-stats, confusion pairs`: `KeySample` carries `typed` (the key the typed char sits on) and `prev`, and a second wrong input at one position is dropped so stop-on-error retries count once. trainer/confusions.ts keeps a `trainerConfusions` store (version 1, per layout, expected key to typed key to count), written from onTestFinished beside recordSamples, capped at the eight most frequent typed keys per expected key and halved once a key passes 200; `worstConfusions` reads with a minimum of 3 and `classifyConfusion` names same finger, mirror hand (same finger, other hand, from keycodeToFinger), neighbour (adjacent in qwertyKeycodeKeymap) or other. The weak-keys panel shows up to four pairs as "k for d (mirror hand) ×5", tips.ts adds a tip for the worst pair after the accuracy and rhythm tips, backup v4 carries the store and "Trainer: reset key stats" clears it. The panel row and the tip appear for every user once a pair reaches 3, lesson or not, like the rest of the weak-keys panel; the position dedupe also means a retried wrong key now counts once in the key stats where it counted every retry before. `prev` is recorded but unread until bigram transitions, which are still open.

Risk: at 97% accuracy the matrix stays sparse for about ten tests.

### Progress dashboard

A chart of attempts against the configured wpm and accuracy lines, plus a per-lesson table. Later, "k is 120 ms faster than last week".

Attempts already hold everything for slice one; the ChartJs wrapper, time scale, annotation plugin and DataTable exist. Raise the attempt cap in the same change. Key deltas need a daily snapshot store written from recordSamples. The reviewer gated deltas behind 15% movement and 20 new samples.

First slice landed in `feat(trainer): progress-dashboard, attempts chart and lesson table`: a ChartJs line of the current layout's attempts with wpm left, accuracy right and the configured floors as annotation lines, plus a DataTable with attempts, best, last wpm and acc and state per lesson, both hidden while the layout has no attempts.

Risk: deltas mean little until sample-model-v2 removes the penalty.

### Curriculum tracks

After lesson 12: capitals by hand, three punctuation steps, a space drill, then the French track from decision 7. Quotes and code tracks are not planned.

Splitting the capitals lesson shifts indices, so this needs id-based progress from foundations C. The French track needs a dead-key table and a sampler that attributes an accented char to two keypresses, see the decisions doc.

First slice landed in `feat(trainer): curriculum-tracks, id-based progress and the capitals split`: Progress v3 stores `current` and `unlocked` as lesson ids per layout, `upgradeProgress` chains v1 to v2 to v3 over the frozen `LESSON_IDS_V2`, `currentLesson()` and `unlockedUpTo()` still return indices and send an unknown id to 0, and backup v3 accepts 1, 2 and 3. "capitals" became "capitals-left" and "capitals-right" from keycodeToFinger, "punctuation" became the ladder "quote-minus", "equal-brackets" and "shifted-punctuation"; the old ids migrate to "capitals-left" and "quote-minus" for attempts, bests and positions. No space drill, since the drill exists.

Second slice landed in `feat(trainer): curriculum-tracks, the French accents track`: trainer/dead-keys.ts maps an accented char to `{ dead, deadLayer, legend, base }` per layout, seeded with canadian_french and matched to a layout object by where its dead legends sit. Lessons with `chars` ("accents-direct" é ç, "accents-grave" è à ù, "accents-circumflex" ê â î ô û, "accents-diaeresis" ë ï ü) resolve each char through findLayoutKey, then the table, and drop what the layout cannot type; `lessonAvailable`, `lessonNumber` and `nextLesson` hide the track and renumber the map on layouts without a table, and unlocks skip it. `samplesFromEventLog` yields a dead-key sample then a base-key sample for an accented char (the pair arrives as one input, so only the dead key carries the spacing), `lessonKeycodes` makes mastery count the dead key and `masteryOf` shares the sample budget over the keys the track resolves to, and the track is offered only while `Config.layout` is "default", since the emulator has no dead-key state; a stored current lesson the layout no longer offers falls back to the nearest one it does. Words come from the largest corpus of `Config.language`; a rare accent mixes pseudo words in once fewer than three real words carry it.

Risk: the layout emulator has no dead-key state, so the French track only works on the OS layout.

### Foundations

Reloads, presets and login stop desyncing the lesson. Unlocks cannot be earned on altered text.

Commit A: swap two lines in lifecycle.ts and refresh the snapshot on the finished event; stop the lesson on watched-key, layout and language changes; gate attempt recording on all target chars being allowed, which also catches Custom Text edits. Commit B: resolve "default" to the real layout name (done). Commit C: Progress v2 with lesson ids, a layout field and a larger attempt cap, backup v2 that migrates on import (done in `feat(trainer): foundations C, progress v2 with lesson ids and per-layout state`). Schema bumps are fine by decision 5; a discriminated union never triggers migrate, so bump the version literal instead.

First slice: commit A, session hardening plus a session spec, about 80 lines.

Risk: persistence cannot import session, so the account-leak fix needs a hook.

### Layout-aware curriculum

canadian_french lesson 12 reads "z é", azerty digits resolve to layer 1. Progress becomes per layout.

lessonLegends exists, so names are about 40 lines. A layer "auto" resolved with findLayoutKey fixes digits. Dead keys have no data anywhere; use an override table seeded with canadian_french. The reviewer cut the frequency generator, plan files and motion hints.

First slice landed in `feat(trainer): layout-aware-curriculum, legend-derived names and an auto layer`: `lessonName` and `lessonKeyLegend` in lessons.ts, `layer: "auto"` with a `charClass` on the numbers lesson so azerty digits resolve to the shifted layer, the home row lesson named by its legends like the two-key lessons, no storage change. Per-layout progress landed earlier with Progress v2 in foundations C. The dead-key override table belongs to curriculum-tracks.

Unblocked by foundations B, which resolves the real layout.

### Keymap heatmap

Weak keys are tinted on the keymap you watch while typing. Finger and row clusters become visible.

Key already layers idle colours, highlight and flash. Plumb keycode through KeyDefinition and add a config key via the finger-colours checklist. The reviewer cut the hands diagram and put heat on the border ring so finger shades stay visible.

First slice landed in `feat(trainer): keymap-visuals, the heatmap`: `KeyDefinition.keycode` set in keymapConverter.ts (the layout indicator key is Space), a `keymapHeat` config key beside the other keymap keys in the appearance group (`"off" | "speed" | "errors"`, default off, through the schemas package, metadata, defaults, commandline metadata and list, and the settings page; it turns the keymap on like finger colours do), and `heatColors` in trainer/heat.ts: a ring colour from theme.sub to theme.error for keys with at least five timed samples in speed mode (emaMs between the layout's 20th and 80th percentile) or five samples in errors mode (errRate from 0 to 15%). Key in Keymap.tsx tints the border, not the fill, so finger shades stay visible; stats come from getLayoutStats over the reactive getConfig like the weak-keys panel. The backend validates config through the schemas package, so both docker images must be rebuilt with monkeybuild before the config PATCH accepts the key.

Risk: both images must rebuild together or the config PATCH 422s.

### Trainer settings

Words per test and unlock strictness become real settings: searchable, preset-able, on the settings page.

The config route is type-enforced and needs no backend code. Use the behavior group to avoid a preset checkbox. syncUnlocked runs before config loads, so move it behind the config event. The reviewer cut auto-tag, the file import UI and algorithm tunables.

First slice landed: trainerUnlock and trainerWordsPerTest in the behavior group, criteriaFor in lessons.ts, syncUnlocked behind the config event, and the custom-text limit re-applied from the config event. Rebuild both images with monkeybuild before the config PATCH accepts the keys.

Risk: changeRequiresRestart does not reapply the custom-text limit; re-apply it from a config event instead.

### Account sync

Dropped by decision 2. Kept here for the record: stage one was a managed trainer tag on lesson results, stage three a clone of the configs contract and DAL with a newest-wins merge per key. perKey was 85% of the payload and write-only.

## Foundation work first

1. lifecycle.ts dispatched fullConfigChangeFinished before setFullConfigStore, so Config and the store disagreed after reload. Done in foundations A.
2. preset-controller.ts saved lesson values to the account; the snapshot in session.ts was never refreshed. Done in foundations A.
3. session.ts only rewrote the snapshot on watched keys; layout and language were unwatched; altered text was still scored. Done in foundations A.
4. practise-words.ts silently dropped the lesson; the next restart reverted to lesson words. Done in foundations A.
5. states/test.ts:185 and key-stats.ts:38 map "default" to qwerty. Resolved through keymapLayout in utils/layout-name.ts; per-layout progress remains for commit C.
6. key-stats.ts:27,84-86 folds a 5000 ms penalty into a value shown as ms. Done in key stats v2.
7. key-stats.ts:51-59 skips deletes without advancing the clock; no pause cap. Done in key stats v2.
8. `applySamples` and `updateStat` in key-stats.ts key by keycode only, so shifted keys still share the base key's stat. Dead keys are attributed since the French track: `samplesFromEventLog` emits the dead key, which carries the spacing, then the base key for an accented char.
9. canUnlock in lessons.ts ignored perKey. Done in the mastery gate: canUnlock goes through unlockStatus and lessons.spec.ts covers the pooling and the shortfalls.
10. lessons.ts capped attempts at 100 across all lessons. Done in foundations C: `trimAttempts` keeps 1000 overall and 50 per lesson and layout.
11. The progress store in lessons.ts passed no migrate; backup.ts was v1-literal for progress. Done in foundations C: `upgradeProgress` runs from the localStorage hook and from the backup union.
12. Progress in lessons.ts was global and attempts lacked a layout field. Done in foundations C: `Progress.layouts` keyed by `progressLayout()`, `Attempt.layout` and `Attempt.lesson` as an id.

## Build order

Now, the page and the signals everything reads:

1. foundations A: session hardening with a session spec. Done in `fix(trainer): harden the lesson session against config changes`; covers foundation items 1 to 4 above.
2. foundations B: resolve "default" to the real layout name. Done in `fix(trainer): resolve the default layout through the keymap layout`; covers foundation item 5 above.
3. trainer-page: skeleton, lesson map, continue button, shared beginLesson action. Done in `feat(trainer): add the trainer page with a lesson map and a shared begin action`.
4. feedback-loop: the lesson chip on the test screen. Done in `feat(trainer): show the active lesson as a chip on the test screen`.
5. trainer-settings: trainerUnlock and trainerWordsPerTest as Config keys. Done in `feat(trainer): add unlock strictness and words per test as config keys`.
6. sample-model-v2: key stats v2 with migrate. Done in `feat(trainer): split key speed from error rate in key stats v2`.

Next, honest data and surfaces on it:

7. foundations C: Progress v2 with lesson ids, layout field, per-layout current and unlocked, larger cap; backup v2. Done in `feat(trainer): foundations C, progress v2 with lesson ids and per-layout state`; covers foundation items 10 to 12 above.
8. mastery-and-phases: the gate only, on top of the configured floor. Done in `feat(trainer): mastery-and-phases, gate unlocks on per-key mastery`; covers foundation item 9 above.
9. feedback-loop: the result card with retry and next. Done in `feat(trainer): feedback-loop, result card with retry and next`.
10. progress-dashboard: attempts chart and per-lesson table on the page. Done in `feat(trainer): progress-dashboard, attempts chart and lesson table`.
11. adaptive-words: corpus and Zipf slice. Done in `feat(trainer): adaptive-words, biggest corpus and damped rank sampling`.
12. targeted-practice: the drill only. Done in `feat(trainer): targeted-practice, weak-key drill on a shared session`.
13. export and import as files instead of a single-line commandline input. Done in `feat(trainer): export and import the backup as a file`.

Later, the French goal and the rest:

14. layout-aware-curriculum: legend-derived names, auto layer, per-layout progress. Done in `feat(trainer): layout-aware-curriculum, legend-derived names and an auto layer`; per-layout progress had landed with step 7.
15. curriculum-tracks: capitals by hand and the punctuation ladder, then the French accents track with a dead-key table. Done in two commits: `feat(trainer): curriculum-tracks, id-based progress and the capitals split` and `feat(trainer): curriculum-tracks, the French accents track`; covers foundation item 8 above for dead keys.
16. pairwise-stats: confusion pairs, then bigram transitions. Confusions done in `feat(trainer): pairwise-stats, confusion pairs`; transitions are still open.
17. adaptive-words: weak-key weighting and mid-lesson rebuilds. Done in `feat(trainer): adaptive-words, weak-key weighting and mid-lesson rebuilds`.
18. mastery-and-phases: speed and accuracy phases. Done in `feat(trainer): mastery-and-phases, accuracy phase then speed phase`.
19. keymap-visuals: the heatmap. Done in `feat(trainer): keymap-visuals, the heatmap`; rebuild both images with monkeybuild before the config PATCH accepts `keymapHeat`.
20. progress-dashboard: key history and deltas.

Now fixes what every later feature reads and gives the trainer its home. Next puts surfaces on data that is honest. Later needs the new data model and the layout work.

## Working agreement

Every build-order step is run with the block below in its prompt. Later prompts copy it verbatim.

Standing requirements, carry these into every step
- No em dashes anywhere: code, comments, commit messages, PR title and body, docs, and the next prompt you write.
- No code comments unless a line would be misread without one. When needed, one short line saying why, never what.
- Steps 14 to 20 go on one branch from `trainer` at ba863f5 or later, one commit per step in the `feat(trainer): ...` style of the history (step 15 may take two, 15a and 15b), each step validated (specs, typecheck, lint, format, madge, headless Chromium) and its roadmap lines updated before the next step starts. Do not open a PR between steps.
- Once step 20 is committed, spawn a subagent with model opus to review the full branch diff against origin/trainer. Ask it to check correctness, any behaviour change when no lesson or drill is active, missing test coverage, stale line refs in docs, and violations of the two rules above. Fix what it finds and fold each fix into the step commit it belongs to with `fixup!` commits and `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash origin/trainer`. Expect conflicts in files every step touches (lessons.ts, lessons.spec.ts); resolve them per step rather than taking a later step's version, and set `GIT_EDITOR` to a command that strips comment lines so no squash message keeps a "# This is a combination" header. Do this even if the diff looks small.
- Then push the branch, open one PR against trainer, subscribe to its activity and schedule an hourly check-in until it is merged or closed. When the PR is merged, stop iterating and say so; the next prompt is written on request. If a step is blocked on a decision only the user can make, say so and stop. If the PR is closed without merging, stop and ask.
