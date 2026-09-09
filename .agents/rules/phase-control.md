# Phase-control commands

**CRITICAL FOR NEW AND RESUMED SESSIONS:**
A message from the user consisting of `i` or `I` (whether entered alone, surrounded by whitespace, or accompanied by `@AGENTS.md`) is **NEVER an incomplete sentence, greeting, or cut-off pronoun "I"**. It explicitly means: **plan and write the next prompt in the implementation plan**. When this input is received, the agent must immediately resolve the next build unit, plan it thoroughly, write the prompt file to `prompts/<number>-<name>.md`, and ask the approval question.

| input | valid starting state | action | stopping state |
| --- | --- | --- | --- |
| `i` or `I` | no current prompt is awaiting approval or approved execution | resolve the next unbuilt target phase or dependency-safe step within one, write exactly one new numbered prompt, and ask the exact §2 step 8 approval question | the prompt is uncommitted, no implementation changed, and control returns to the user |
| `y` or `Y` | the intended prompt is identifiable from the immediately preceding approval request, or from the next/written prompt in `prompts/` when chat context is unavailable | re-read and execute only that prompt through implementation, verification, review, documentation, and its required local commit to `main` | all approved-task changes are committed locally, any pre-existing unrelated changes remain untouched, and nothing was pushed |
| `P` | the intended work is committed, the worktree is clean, the current branch is `main`, and it has a configured upstream | run the §7 read-only preflight, then make one normal non-force push | the upstream contains the local commits, nothing needed pushing, or Git failed safely without changing the repository |

### Resolving the next build unit for `i` / `I`

1. Establish what is committed from the repository and `git log`, never from prompt files. A committed prompt proves that it was written, not executed.
2. Read the ordered target phases in `docs/build-plan.md` and their concise index in `AGENTS.md` §8.2. Select the earliest unbuilt phase whose dependencies are committed; when a phase is too large for one safe implementation, select its earliest dependency-safe prompt-sized step and identify its parent phase.
3. Honour a direct user-requested scope when it is dependency-safe.
4. Set the prompt number to the highest existing number in `prompts/` plus one. Never infer, renumber, overwrite, or reuse a prompt number.
5. Name the chosen scope and why it is next in the reply before writing.
6. Write exactly one prompt satisfying `AGENTS.md` §5, including its complete skill manifest and verification plan, then ask exactly: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. Stop. Loading skills to prepare the prompt is required; do NOT begin implementation, dependency changes, migrations, staging, or committing.
