# Prompt 17 — Phase-control commands

## Scope and why this is next

Update `AGENTS.md` so the single-letter workflow is explicit for every remaining
step or target phase in the Acres build plan:

- `i` or `I` discovers the next unbuilt step or phase, writes its next numbered
  implementation prompt, and stops at the approval question;
- `y` or `Y` accepts the currently prepared prompt and executes it through
  implementation, verification, review, documentation, and commit;
- uppercase `P` pushes the already committed local `main` branch to its
  configured upstream.

This is next because prompt 16 established the canonical phased build plan, but
`AGENTS.md` currently documents only the `i`/`I` and `y`/`Y` pair and leaves the
push command implicit. The command contract must be unambiguous before phase 2
work begins.

## Reference material read

- `AGENTS.md` §2, especially steps 7–14: the required prompt, approval,
  implementation, verification, review, documentation, and commit sequence.
- `AGENTS.md` “Resuming in a new session”: the existing meanings of `i`/`I` and
  `y`/`Y`, and the rules for resolving the next prompt number and scope.
- `AGENTS.md` §5: the prompt-file contract.
- `AGENTS.md` §7: commit-to-main behavior and the current “Do not push unless
  asked” boundary.
- `AGENTS.md` §8.2 and `docs/build-plan.md`: the distinction between legacy
  steps, target phases, and numbered prompt files.
- `git log` and `prompts/`: prompt 16 is committed and prompt 17 is the next
  available number.

This is a workflow-documentation change. No visual reference, crop, or measured
design value applies.

## Required interpretation

Treat the user’s wording as a three-command protocol, not as authorization to
push during this prompt:

1. `i` and `I` mean “prepare,” not “execute.” Each invocation resolves the next
   unbuilt unit from `docs/build-plan.md`, which may be a whole phase or a
   dependency-safe step within a phase, creates exactly one new numbered prompt,
   and stops for approval.
2. `y` and `Y` mean “approve and execute the currently prepared prompt.” They do
   not select a different phase and do not skip the checks, review loop,
   documentation, or required local commit.
3. `P` means “push committed `main` to its configured upstream.” It is a
   separate, explicit action after a successful local commit. It does not imply
   force-push, branch creation, remote selection, or bypassing a dirty-tree or
   missing-upstream failure.
4. Lowercase `p` is not assigned, because the user named uppercase `P`.
5. Writing this contract does not itself invoke `P`; the implementation commit
   remains local unless the user sends `P` afterward.

## Command contract

The implementation must make the command protocol readable without relying on
conversation history. Use this behavior matrix as the normative source:

| input | valid starting state | action | required stopping state |
| --- | --- | --- | --- |
| `i` or `I` | no approved prompt is waiting to execute | resolve the next unbuilt phase or dependency-safe phase step, write one new numbered prompt, and ask the exact approval question from §2 step 8 | prompt exists as an uncommitted file; no implementation changes exist; control is returned to the user |
| `y` or `Y` | one current prompt has just been presented for approval and remains the intended prompt | treat the prompt as approved, re-read it, load its named skills, implement it, verify it, review it, document it, and commit it locally to `main` | implementation is committed; worktree is clean; nothing has been pushed |
| `P` | current branch is `main`; intended work is committed; worktree is clean; `main` has a configured upstream | inspect the branch/upstream relationship, then perform a normal non-force push of local `main` | upstream contains the local commits, or the push failed safely with the repository unchanged |

The command letters are exact user-message shorthands. A longer natural-language
request continues to follow the normal workflow in §2; the shorthand does not
replace ordinary user instructions. If a message contains a substantive request
in addition to a letter, follow the substantive request and do not silently
reinterpret it as the shorthand.

### State transitions

Document the intended lifecycle in prose or a compact flow that is equivalent
to:

```text
Committed phase N
  └─ i / I
      └─ Prompt N+1 prepared; awaiting approval
          └─ y / Y
              └─ Prompt N+1 implemented, reviewed, and committed locally
                  ├─ i / I → prepare the next unbuilt phase unit
                  └─ P     → push committed main to its configured upstream
```

`P` is deliberately outside the prompt execution lifecycle. A successful
`y`/`Y` never auto-chains into `P`, and `P` never creates, approves, executes,
reviews, or commits a prompt.

## Resolving the next build unit for `i` / `I`

Make the resolution algorithm explicit enough that a new session can perform it
without guessing:

1. Read the repository and `git log` to establish which work is actually
   committed. Prompt files alone are not execution evidence.
2. Read the canonical ordered target phases in `docs/build-plan.md` and the
   concise index in `AGENTS.md` §8.2.
3. Select the earliest unbuilt phase whose dependencies are committed. If that
   phase is too large for one safe implementation, select its earliest
   dependency-safe step and say that it is part of that phase.
4. Respect a direct user-requested scope when it is valid and dependency-safe.
   If it skips an unmet dependency or materially conflicts with the build plan,
   stop and explain the conflict rather than silently reordering the plan.
5. Determine the prompt number from the highest existing number in `prompts/`
   plus one. Never infer the prompt number from the phase number.
6. Announce the selected scope and why it is next before writing the prompt.
7. Write exactly one prompt satisfying §5, including the complete skill
   manifest and verification plan.
8. Ask exactly: `I prepared the implementation prompt at
   prompts/<file-name>.md. Is this good to execute?`
9. Stop. Do not load implementation-only skills, edit implementation files, run
   migrations, install dependencies, stage, commit, or push merely because
   `i`/`I` was entered.

The existing stale wording that points to “§5.2’s build sequence” must be
corrected: the concise sequence is now `AGENTS.md` §8.2 and the canonical detail
is `docs/build-plan.md`.

## Executing the prepared prompt for `y` / `Y`

The final `AGENTS.md` wording must preserve the full execution gate rather than
making `y`/`Y` sound like a generic confirmation:

1. Identify the current prompt from the immediately preceding approval request;
   do not choose the newest file merely because it has the highest number if the
   conversation points to another prompt.
2. Re-read the approved prompt completely.
3. Re-read `AGENTS.md`, owning documentation, verified framework references,
   and every skill named under `## SKILLS USED` before implementation.
4. Implement only the approved scope and preserve unrelated worktree changes.
5. Run the prompt’s verification commands and the standing repository checks,
   quoting actual results.
6. Complete the mandatory requesting/receiving code-review loop and re-review
   significant corrections.
7. Update the owning documentation when the prompt requires it.
8. Stage only the approved files, review the staged diff, and use
   `caveman-commit` for the local commit to `main`.
9. Return the outcome and exact way to inspect or run it. Do not push.

If no current prompt can be identified safely, `y`/`Y` must not guess or execute
an arbitrary prompt. Report the missing approval context and ask the user to
name or prepare the prompt.

## Pushing for `P`

Specify a read-only preflight before any network mutation:

```bash
git status --short
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
git log -1 --oneline
```

The implementation of the command contract must say how the later `P` action
handles each result:

- **Dirty tree:** do not stage, commit, discard, stash, or push. Report the paths
  and stop because `P` authorizes only a push.
- **Branch is not `main`:** do not switch branches or push another branch. Report
  the active branch and stop.
- **No configured upstream:** do not invent a remote, run `git push -u`, or alter
  configuration. Report the missing upstream and ask for explicit direction.
- **Valid clean state:** run a normal `git push` or an equally explicit normal
  push of `main` to its configured upstream. Never pass a force flag.
- **Authentication/network/rejection/non-fast-forward failure:** report Git’s
  actual error. Do not pull, rebase, merge, force-push, change credentials, or
  rewrite history without a new user instruction.
- **Nothing to push:** report that local `main` is already synchronized; treat
  the command as successfully handled without creating a commit.

`P` is authorization for one normal push attempt only. It is not authorization
to push tags, all branches, submodules, packages, releases, or deployment
artifacts.

## File changes

### `AGENTS.md`

Revise the “Resuming in a new session” command paragraph into a compact,
scannable command protocol that states all three commands and their boundaries.
Preserve the existing rules for resolving “next,” while clarifying that:

- the full build consists of the ordered target phases in `docs/build-plan.md`;
- a phase may require one or more dependency-safe prompt-sized steps;
- `i`/`I` prepares the next such unit and never implements it;
- `y`/`Y` executes only the currently approved prompt and ends with the required
  local commit;
- `P` pushes only after the committed state has been verified.

Update §2 step 9 if needed so the `y`/`Y` definition points to the command
protocol rather than duplicating or weakening it.

Update §2 step 14 and §7 so “Do not push unless asked” remains true while naming
`P` as the explicit request that authorizes a normal push of local `main` to the
configured upstream. State the push safety behavior:

- verify the current branch is `main`;
- require a clean working tree and a configured upstream;
- use a normal non-force push;
- stop and report a missing upstream, rejected push, authentication failure, or
  non-fast-forward condition instead of changing remotes, force-pushing, or
  rewriting history.

Keep the wording internally consistent. Do not create a second conflicting
command definition elsewhere in the file.

### Required edit locations

Limit substantive edits to these existing areas:

1. **§2 step 9:** retain the approval gate and define `y`/`Y` by reference to
   the authoritative command protocol.
2. **§2 step 14:** retain the automatic local commit, explicitly state that it
   does not include a push, and point to uppercase `P` as the later push
   authorization.
3. **“Resuming in a new session”:** rename the heading if useful so it clearly
   owns all three phase-control commands, then add the command matrix/lifecycle
   and the resolution rules. Correct the stale §5.2 build-sequence reference to
   §8.2 plus `docs/build-plan.md`.
4. **§7 “Commits”:** retain the `caveman-commit` contract, then define the `P`
   preflight and safe normal-push boundary without duplicating all workflow
   prose.

Do not add this rule to the ALWAYS ledger: the user did not use the reserved word
`ALWAYS`. The command protocol is already within the intended AGENTS.md cap
because §1.8 explicitly assigns workflow and commands to this file.

### Wording constraints

- Use “write” or “prepare” for what `i`/`I` does; do not say it implements the
  phase.
- Use “execute” for what `y`/`Y` does; make clear that execution includes the
  required local commit.
- Use uppercase `P` consistently and explicitly leave lowercase `p` undefined.
- Distinguish a build **phase**, a dependency-safe **step within a phase**, and a
  numbered **prompt file**. Never imply that their numbers are identical.
- Use “configured upstream” rather than hard-coding `origin/main`.
- Use “normal non-force push”; never encode or recommend `--force`,
  `--force-with-lease`, remote mutation, or automatic conflict resolution.
- Avoid promising that a push succeeded before Git reports success.
- Preserve the exact approval question required by §2 step 8.

## Expected behavior

After the change, a fresh session can read `AGENTS.md` and deterministically
interpret:

- `i` / `I` → identify the next unbuilt phase unit, write one prompt, ask for
  approval, stop;
- `y` / `Y` → execute that prompt fully and commit it locally to `main`;
- `P` → verify and push the committed local `main` branch normally to its
  configured upstream.

The current implementation of this prompt must stop after its local commit. A
push occurs only if the user subsequently enters uppercase `P`.

## Non-goals

- Do not execute phase 2 or write its implementation prompt.
- Do not change `docs/build-plan.md`, product architecture, application code,
  dependencies, schemas, tests, CI, remotes, or branch configuration.
- Do not add semantics for lowercase `p` or any other shorthand.
- Do not push, force-push, set an upstream, create a remote, or rewrite history.
- Do not alter the established requirement that every executed prompt is
  reviewed and committed locally to `main`.
- Do not convert the phase sequence into a calendar, estimate, or sprint plan.
- Do not renumber phases or prompts, mark phase 2 complete, or claim prompt 17 is
  executed merely because this file exists.
- Do not broaden `P` into permission for deployment, release publication, pull
  request creation, tag publication, or remote repository configuration.
- Do not introduce scripts, aliases, hooks, Git configuration, or application
  code to implement these conversational commands.

## Implementation sequence

1. Re-read this approved prompt from start to finish.
2. Read `AGENTS.md` §1.8, §2, §2.1, “Resuming in a new session,” §5, §7, §8.2,
   and §10 completely; read `docs/build-plan.md` §1 and its phase index.
3. Load `requesting-code-review`, `receiving-code-review`, and
   `caveman-commit` before their respective actions. State that no other skill
   owns this documentation-only command edit.
4. Record `BASE_SHA` with `git rev-parse HEAD`, confirm the active branch with
   `git branch --show-current`, and inspect `git status --short`. Preserve any
   unrelated changes if present.
5. Search for every existing command/push statement before editing:

   ```bash
   rg -n 'Entering|Approved\. Execute|Do not push|push unless|commit to `main`|build sequence|prompt file' AGENTS.md
   ```

6. Edit only `AGENTS.md`. Implement the command matrix, state boundaries,
   corrected build-sequence pointer, and `P` safety preflight at the required
   locations above.
7. Read the complete modified sections in context, not only the diff. Confirm
   §2, the command protocol, §5, §7, and §8.2 tell one consistent story.
8. Run focused static assertions that prove:
   - `i`/`I` prepares exactly one prompt and stops;
   - `y`/`Y` executes the identified prompt and commits locally;
   - `P` performs only a normal push after clean-main/upstream checks;
   - lowercase `p` is explicitly undefined;
   - the stale §5.2 build-sequence pointer is gone;
   - “Do not push unless asked” has not been weakened into automatic pushing.
9. Run the full repository checks below and retain their real outputs.
10. Inspect `git diff -- AGENTS.md` and `git diff --check`. Ensure the only
    untracked file is this approved prompt unless unrelated user work was
    already present.
11. Use `requesting-code-review` to dispatch a reviewer subagent with the user
    requirement, this prompt path, `BASE_SHA`, current `HEAD_SHA`, exact changed
    files, command semantics, non-goals, and verification results.
12. Use `receiving-code-review` to validate every finding against the actual
    wording. Fix only valid findings. If a fix changes semantics or introduces a
    new command state, run a follow-up review.
13. Re-run focused searches, `git diff --check`, and any repository checks
    affected by a correction.
14. Stage exactly `AGENTS.md` and
    `prompts/17-phase-control-commands.md`. Inspect both staged names and the
    staged diff; do not use a broad staging command.
15. Invoke `caveman-commit` to produce the message, then commit locally to
    `main` as required by §2 step 14.
16. Verify the final worktree is clean and report the commit hash, command
    behavior, review result, and check results.
17. Stop without pushing. Tell the user that entering uppercase `P` in a later
    message now authorizes the guarded normal push.

## Verification

Run and report the real output of:

```bash
rg -n 'Entering|`i`|`I`|`y`|`Y`|`P`|push|force-push|upstream' AGENTS.md
git diff --check
npm run lint
npm run typecheck
npm run build
npm run test:server
git diff --stat
git status --short
```

Before committing, also run `git diff --cached --check` and inspect
`git diff --cached --name-only` to confirm that only `AGENTS.md` and
`prompts/17-phase-control-commands.md` are staged.

Acceptance criteria:

- all three commands have one clear meaning;
- `i`/`I` works phase by phase or dependency-safe step by dependency-safe step
  and always stops after preparing one prompt;
- `y`/`Y` executes only the prepared prompt and retains every existing quality
  gate and the local commit requirement;
- `P` alone authorizes a normal push of clean, committed `main` to its configured
  upstream;
- no force-push, remote mutation, implicit push, or lowercase `p` behavior is
  introduced;
- the repository checks and staged-diff checks pass;
- the reviewer reports no unresolved blocking or important findings;
- the final worktree is clean after the local commit.

## Acceptance scenarios

The reviewer must reason through each scenario against the final text:

1. **Fresh session, user enters `i`:** the agent inspects Git and the build plan,
   selects phase 2 or its earliest safe step, writes the next numbered prompt,
   asks for approval, and stops without implementation or commit.
2. **User enters `Y` after prompt 17 is presented:** the agent executes prompt
   17 only, completes checks/review, commits locally, and does not push.
3. **User enters `y` with no identifiable current prompt:** the agent does not
   run the highest-numbered prompt by assumption; it asks which prompt is being
   approved.
4. **User enters `P` on clean local `main` with an upstream:** the agent runs the
   read-only preflight and one normal push.
5. **User enters `P` with unstaged changes:** the agent reports the dirty paths
   and stops without staging, committing, stashing, discarding, or pushing.
6. **User enters `P` from another branch:** the agent reports the branch and
   stops without switching or pushing.
7. **User enters `P` without an upstream:** the agent reports the missing
   configuration and asks for direction; it does not invent `origin/main`.
8. **The remote rejects `P`:** the agent reports the exact failure and does not
   pull, merge, rebase, force, or rewrite history.
9. **User enters lowercase `p`:** no shorthand is inferred; the agent treats it
   as ordinary ambiguous input and requests clarification if needed.
10. **User asks for a specific later phase via normal prose:** the dependency
    graph still governs; the single-letter protocol does not authorize skipping
    unmet dependencies.

## Review request requirements

The reviewer context must ask specifically for findings on:

- contradictions among §2, the command protocol, §5, §7, and §8.2;
- ambiguity over whether `i`/`I` writes or implements;
- ambiguity over which prompt `y`/`Y` approves;
- any path by which `y`/`Y` could push automatically;
- unsafe or expansive interpretations of `P`;
- stale section references or confusion between phase, phase step, and prompt
  numbering;
- erosion of the mandatory verification, review, documentation, or commit gates;
- accidental addition to the ALWAYS ledger.

Classify findings by severity and cite exact lines. A clean review must say
explicitly that no blocking or important findings remain.

## Documentation ownership

`AGENTS.md` owns the workflow and command protocol, so no separate `docs/` file
is needed for this change. The prompt file records the approved implementation
brief; it is not evidence of execution until the resulting commit exists.

## SKILLS USED

- `requesting-code-review` — dispatch the mandatory reviewer after
  self-verification with the requirements, changed files, checks, and git SHAs.
- `receiving-code-review` — verify reviewer feedback against the command
  contract before applying any change.
- `caveman-commit` — generate the required concise Conventional Commit message
  for the final local commit.
