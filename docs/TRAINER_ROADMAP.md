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

- The chip at LessonNotice.tsx now names the active lesson, its best and the target on the test screen. Feedback beyond it is still one toast at index.ts:51.
- The key EMA is not a speed: a 5000 ms error penalty at key-stats.ts:27,84-86, backspace and pause time charged to the next key at key-stats.ts:51-59, shift ignored at key-stats.ts:95-111. Panel and tips print it as ms.
- Unlocks use test-level numbers: canUnlock in lessons.ts reads the bar from trainerUnlock through criteriaFor, and only strict asks for two passes in a row; perKey from index.ts is still read nowhere.
- Early lessons are gibberish: english.json has 3 home-row words, so with minReal 30 at lessons.ts:118 lessons 1-4 are mostly "afa sas dad" from lessons.ts:142-171. The pool is built once at session.ts:126-150.
- Layout is assumed qwerty: names hardcoded at lessons.ts:57-67, progress global at lessons.ts:257-262. "default" now resolves through keymapLayout in utils/layout-name.ts; commit C still owes per-layout progress.
- Config leaks: lifecycle.ts:110-111 fires the finished event before the store is set, preset-controller.ts:46 saves lesson values to the account, session.ts:209-213 lets punctuation alter scored text.
- No escape hatch: no migrate at lessons.ts:315-319, a global 100-attempt cap at lessons.ts:265, a v1-literal backup replaced on import at backup.ts:5-9,30-36.

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

First slice: biggest corpus, damped rank sampling, pool of 120, word-initial capitals.

Risk: the fresh-char pass mutates real words; make it resample.

### Lesson feedback loop

A chip reads "lesson 3: r u · best 28 · target 30 / 97%". The result screen says "27 wpm, 3 short" with retry and next.

The chip is a Notice over the reactive getActiveLesson and progress signals; "trainer" joins the closed CommandlineListKey union. The card mounts beside the weak-keys panel and must read reactive progress, since recordAttempt is async. Celebration, daily goal and streak are out by decision 6.

First slice landed: the chip alone, a Notice over getActiveLesson and progress that opens /trainer, no new state. What remains is the result card with retry and next, build-order step 9.

Risk: a second full-width panel crowds the result page.

### Sample model v2

Weak keys stop being hijacked by a coffee break or a word's first letter. Keys are labelled slow or error-prone.

Sampler on input events only: advance the clock on deletes, flag recovery, cap spacing at three times the EMA, drop the penalty, track error rate separately. Backspace and shift have no keydown events, so the reviewer cut keydown pairing, hold time and per-key think time. Migrate v1 through the existing hook.

First slice: one change in key-stats.ts splitting emaMs from errRate under version 2.

Risk: splitting shifted keys thins samples; gate labels on counts.

### Mastery gate and phases

A lesson unlocks when its new keys are mastered, not when old keys mask weak ones. A failed attempt says what is missing.

perKey is recorded per attempt and never read. Pool the last three attempts, require 20 fresh samples and at most 3% fresh errors, keep the configured floors. The reviewer showed a 95% Wilson bound is unreachable at 15 samples, so use plain counts; a per-key minAcc was cut because failed tests are never recorded.

First slice: masteryOf and unlockStatus wired into canUnlock, plus a shortfall notice on the result card.

Risk: the shortfall copy needs a surface; the indicator never renders today.

### Targeted practice

A drill button runs 30 seconds on your three slowest keys with before and after. Warm-up is a zero-decision start.

startLesson is thin glue, so a general startSession is mechanical. The reviewer cut SM-2 and the every-third-continue hijack, and found two blockers: section limits under 10 are invalid, and tests under 75% accuracy discard samples. Pass a finer samplesUsable flag from test-logic.

First slice: startSession extraction, a drill builder with spec, one command, the flag.

Risk: drill code importing test-logic cycles through trainer/index.

### Trainer page

A lesson map shows legends, state and best per lesson, plus a continue button. Switching lessons leaves the commandline.

Plumbing mirrors every SolidJS page: PageName union, solidPage, route, index.html container, mount key, nav button. nginx already serves any path. Starting a lesson is startLesson then navigate, since the test page restarts on show. Bests need a new progress field; the 100-attempt cap evicts them. The reviewer cut the intro modal, the mobile row and the keytip.

First slice, landed in `feat(trainer): add the trainer page with a lesson map and a shared begin action`: `/trainer` route, nav button, a "Trainer: open page" command, a lesson map with legends, state and a best derived from the stored attempts whose unlocked rows start the lesson, a continue button, and `beginLesson` in trainer/actions.ts shared with the commandline. Still to come: the picker modal, the attempts chart, the per-lesson table, and a per-lesson best field once commit C raises the attempt cap.

Risk: commandline exec wipes a chained modal unless opensModal is set.

### Confusion pairs and transitions

"You press k when you mean d, mirror hand" replaces "88% on d". Slow same-finger bigrams get named.

Insert events carry the typed char, so adding typed and prev to samples is 15 lines. Dedupe wrong samples per position so stop-on-error retries count once. Hand must come from finger; the side sets in constants/keys.ts overlap. The reviewer killed write-time pruning; use caps, decay and read-time minimums.

First slice: confusions only, one panel row, classification helpers with specs.

Risk: at 97% accuracy the matrix stays sparse for about ten tests.

### Progress dashboard

A chart of attempts against the configured wpm and accuracy lines, plus a per-lesson table. Later, "k is 120 ms faster than last week".

Attempts already hold everything for slice one; the ChartJs wrapper, time scale, annotation plugin and DataTable exist. Raise the attempt cap in the same change. Key deltas need a daily snapshot store written from recordSamples. The reviewer gated deltas behind 15% movement and 20 new samples.

First slice: chart plus table on the trainer page.

Risk: deltas mean little until sample-model-v2 removes the penalty.

### Curriculum tracks

After lesson 12: capitals by hand, three punctuation steps, a space drill, then the French track from decision 7. Quotes and code tracks are not planned.

Splitting the capitals lesson shifts indices, so this needs id-based progress from foundations C. The French track needs a dead-key table and a sampler that attributes an accented char to two keypresses, see the decisions doc.

First slice: id-based lessons with the capitals split by hand, which is the prerequisite for any new track.

Risk: the layout emulator has no dead-key state, so the French track only works on the OS layout.

### Foundations

Reloads, presets and login stop desyncing the lesson. Unlocks cannot be earned on altered text.

Commit A: swap two lines in lifecycle.ts and refresh the snapshot on the finished event; stop the lesson on watched-key, layout and language changes; gate attempt recording on all target chars being allowed, which also catches Custom Text edits. Commit B: resolve "default" to the real layout name (done). Commit C: Progress v2 with lesson ids, a layout field and a larger attempt cap, backup v2 that migrates on import. Schema bumps are fine by decision 5; a discriminated union never triggers migrate, so bump the version literal instead.

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

1. lifecycle.ts:110-111 dispatches fullConfigChangeFinished before setFullConfigStore, so Config and the store disagree after reload.
2. preset-controller.ts:46 saves lesson values to the account; the snapshot at session.ts:22-30 is never refreshed.
3. session.ts:209-213 only rewrites the snapshot on watched keys; layout and language unwatched; altered text still scored.
4. practise-words.ts:153-162 silently drops the lesson; the next restart reverts to lesson words.
5. states/test.ts:185 and key-stats.ts:38 map "default" to qwerty. Resolved through keymapLayout in utils/layout-name.ts; per-layout progress remains for commit C.
6. key-stats.ts:27,84-86 folds a 5000 ms penalty into a value shown as ms.
7. key-stats.ts:51-59 skips deletes without advancing the clock; no pause cap.
8. key-stats.ts:95-111 ignores sample.shifted.
9. lessons.ts:297-313 canUnlock ignores perKey; lessons.spec.ts:156 locks this in.
10. lessons.ts:265,355 cap attempts at 100 across all lessons.
11. lessons.ts:315-319 and key-stats.ts:159-163 pass no migrate; backup.ts:5-9 is v1-literal and replaces on import.
12. lessons.ts:257-262 progress is global and attempts lack a layout field.

## Build order

Now, the page and the signals everything reads:

1. foundations A: session hardening with a session spec. Done in `fix(trainer): harden the lesson session against config changes`; covers foundation items 1 to 4 above.
2. foundations B: resolve "default" to the real layout name. Done in `fix(trainer): resolve the default layout through the keymap layout`; covers foundation item 5 above.
3. trainer-page: skeleton, lesson map, continue button, shared beginLesson action. Done in `feat(trainer): add the trainer page with a lesson map and a shared begin action`.
4. feedback-loop: the lesson chip on the test screen. Done in `feat(trainer): show the active lesson as a chip on the test screen`.
5. trainer-settings: trainerUnlock and trainerWordsPerTest as Config keys. Done in `feat(trainer): add unlock strictness and words per test as config keys`.
6. sample-model-v2: key stats v2 with migrate.

Next, honest data and surfaces on it:

7. foundations C: Progress v2 with lesson ids, layout field, per-layout current and unlocked, larger cap; backup v2.
8. mastery-and-phases: the gate only, on top of the configured floor.
9. feedback-loop: the result card with retry and next.
10. progress-dashboard: attempts chart and per-lesson table on the page.
11. adaptive-words: corpus and Zipf slice.
12. targeted-practice: the drill only.
13. export and import as files instead of a single-line commandline input.

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
- Before committing, spawn a subagent with model opus to review the full diff. Ask it to check correctness, any behaviour change when no lesson is active, missing test coverage, and violations of the two rules above. Fix what it finds. Do this even if the diff looks small.
- Push the branch and open a PR against trainer, subscribe to its activity and schedule an hourly check-in until it is merged or closed. When the PR is merged, write the prompt for the next build-order step in docs/TRAINER_ROADMAP.md with the same shape as this one: context, work items with file:line refs verified against the current trainer branch, tests, validation, deliverable, and this Standing requirements block copied verbatim, including this instruction. Post that prompt in your reply, then start it in this same session on a fresh branch from the updated trainer. Stop iterating once the PR for step 6 is merged, or when a step is blocked on a decision only the user can make; in both cases say so and stop. If a PR is closed without merging, stop and ask.
