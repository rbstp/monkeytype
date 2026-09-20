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
- Key stats v2 keeps speed apart from errors: emaMs takes only correct, non-recovery samples with pauses capped at three times the average, errRate is its own moving average, and deletes advance the clock. Shift is still folded into the base key in key-stats.ts. Panel and tips label keys slow or error-prone.
- Unlocks read the configured floor through criteriaFor and, since the mastery gate, `masteryOf` in lessons.ts pools perKey over the last three attempts: a new key needs its share of a 60-sample budget (20 for a two-key lesson, 3 for capitals) and at most 3% errors before `unlockStatus` says ok. The result card prints the first shortfall.
- Early lessons read real words since the adaptive-words slice: `largestCorpus` in session.ts loads english_10k, `buildLessonWords` draws by damped rank when the corpus is ordered by frequency and never mutates a real word. The 120-word pool is still built once per startLesson; weak-key weighting and mid-lesson rebuilds are build-order step 17.
- Layout is assumed qwerty in the lesson names hardcoded in LESSONS in lessons.ts. "default" resolves through keymapLayout in utils/layout-name.ts, and progress is per layout since Progress v2: `progressLayout()` in lessons.ts names the entry that `currentLesson()`, `unlockedUpTo()` and `bestOf()` read.
- Config leaks, closed by foundations A: lifecycle.ts sets the store before it fires the finished event, the persisted config hook in session.ts keeps lesson values out of the saved config, and index.ts scores an attempt only when isLessonText accepts the target words.
- Progress v2 migrates v1 through the localStorage hook and on backup import, keeps 1000 attempts with at most 50 per lesson and layout, and stores a best per lesson so trimming never evicts one. Key stats do the same since key stats v2. The backup travels as a file: `exportBackupFile` and `importBackupFile` in trainer/actions.ts, wired to the trainer page header and the two commandline commands.

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

First slice: confusions only, one panel row, classification helpers with specs.

Risk: at 97% accuracy the matrix stays sparse for about ten tests.

### Progress dashboard

A chart of attempts against the configured wpm and accuracy lines, plus a per-lesson table. Later, "k is 120 ms faster than last week".

Attempts already hold everything for slice one; the ChartJs wrapper, time scale, annotation plugin and DataTable exist. Raise the attempt cap in the same change. Key deltas need a daily snapshot store written from recordSamples. The reviewer gated deltas behind 15% movement and 20 new samples.

First slice landed in `feat(trainer): progress-dashboard, attempts chart and lesson table`: a ChartJs line of the current layout's attempts with wpm left, accuracy right and the configured floors as annotation lines, plus a DataTable with attempts, best, last wpm and acc and state per lesson, both hidden while the layout has no attempts.

Risk: deltas mean little until sample-model-v2 removes the penalty.

### Curriculum tracks

After lesson 12: capitals by hand, three punctuation steps, a space drill, then the French track from decision 7. Quotes and code tracks are not planned.

Splitting the capitals lesson shifts indices, so this needs id-based progress from foundations C. The French track needs a dead-key table and a sampler that attributes an accented char to two keypresses, see the decisions doc.

First slice: id-based lessons with the capitals split by hand, which is the prerequisite for any new track.

Risk: the layout emulator has no dead-key state, so the French track only works on the OS layout.

### Foundations

Reloads, presets and login stop desyncing the lesson. Unlocks cannot be earned on altered text.

Commit A: swap two lines in lifecycle.ts and refresh the snapshot on the finished event; stop the lesson on watched-key, layout and language changes; gate attempt recording on all target chars being allowed, which also catches Custom Text edits. Commit B: resolve "default" to the real layout name (done). Commit C: Progress v2 with lesson ids, a layout field and a larger attempt cap, backup v2 that migrates on import (done in `feat(trainer): foundations C, progress v2 with lesson ids and per-layout state`). Schema bumps are fine by decision 5; a discriminated union never triggers migrate, so bump the version literal instead.

First slice: commit A, session hardening plus a session spec, about 80 lines.

Risk: persistence cannot import session, so the account-leak fix needs a hook.

### Layout-aware curriculum

canadian_french lesson 12 reads "z é", azerty digits resolve to layer 1. Progress becomes per layout.

lessonLegends exists, so names are about 40 lines. A layer "auto" resolved with findLayoutKey fixes digits. Dead keys have no data anywhere; use an override table seeded with canadian_french. The reviewer cut the frequency generator, plan files and motion hints.

First slice: legend-derived names plus auto layer for numbers, no storage change.

Unblocked by foundations B, which resolves the real layout.

### Keymap heatmap

Weak keys are tinted on the keymap you watch while typing. Finger and row clusters become visible.

Key already layers idle colours, highlight and flash. Plumb keycode through KeyDefinition and add a config key via the finger-colours checklist. The reviewer cut the hands diagram and put heat on the border ring so finger shades stay visible.

First slice: keycode plumbing, an off/speed config, a border tint.

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
8. key-stats.ts:95-111 ignores sample.shifted.
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

14. layout-aware-curriculum: legend-derived names, auto layer, per-layout progress.
15. curriculum-tracks: capitals by hand and the punctuation ladder, then the French accents track with a dead-key table.
16. pairwise-stats: confusion pairs, then bigram transitions.
17. adaptive-words: weak-key weighting and mid-lesson rebuilds.
18. mastery-and-phases: speed and accuracy phases.
19. keymap-visuals: the heatmap.
20. progress-dashboard: key history and deltas.

Now fixes what every later feature reads and gives the trainer its home. Next puts surfaces on data that is honest. Later needs the new data model and the layout work.

## Working agreement

Every build-order step is run with the block below in its prompt. Later prompts copy it verbatim.

Standing requirements, carry these into every step
- No em dashes anywhere: code, comments, commit messages, PR title and body, docs, and the next prompt you write.
- No code comments unless a line would be misread without one. When needed, one short line saying why, never what.
- Steps 7 to 13 go on one branch from `trainer` at b556c59 or later, one commit per step in the `feat(trainer): ...` style of the history, each step validated (specs, typecheck, lint, format, madge, headless Chromium) and its roadmap lines updated before the next step starts. Do not open a PR between steps.
- Once step 13 is committed, spawn a subagent with model opus to review the full branch diff against origin/trainer. Ask it to check correctness, any behaviour change when no lesson is active, missing test coverage, stale line refs in docs, and violations of the two rules above. Fix what it finds and fold each fix into the step commit it belongs to with `fixup!` commits and `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash origin/trainer`. Do this even if the diff looks small.
- Then push the branch, open one PR against trainer, subscribe to its activity and schedule an hourly check-in until it is merged or closed. When the PR is merged, stop iterating and say so; the next prompt (step 14 onward) is written on request. If a step is blocked on a decision only the user can make, say so and stop. If the PR is closed without merging, stop and ask.
