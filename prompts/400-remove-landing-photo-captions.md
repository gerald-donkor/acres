# Remove visible landing photo captions

## Request and scope

User request: “remove these”, with a screenshot showing
“Espoo, Finland · Photo by Julius Jansson / Unsplash”. Interpret the plural as
all three matching location/photographer captions on the public landing page.
Remove those visible lines and their caption-only spacing. Retain the real
photographs, meaningful image alt text and source/licence provenance.

This is a narrow follow-up to executed prompt 399, independent of backend or
launch work. Baseline is `96dce6f`; the worktree was clean before preparing this
prompt. This prompt awaits the approval required by AGENTS.md §2 step 8.

## References and evidence read

- Current `AGENTS.md` workflow, particularly §2 steps 7–14.
- User-provided screenshot
  `/home/dgk/Pictures/screenshot-2026-10-19_17-11-02.png`, displayed in chat.
- `client/app/(marketing)/page.tsx`: three `figcaption` blocks and the shared
  `captionClass`; the hero comment describes captions that will no longer exist.
- `docs/landing.md` Prompt 399 implementation/verification record.
- `docs/design-system.md` §12: scoped photographic landing roles.
- `client/public/assets/ui/landing/editorial/SOURCES.md`: the licence checked in
  this session permits this commercial use without mandatory attribution.
- Installed Next `page.md` reference confirms the page stays server-rendered.
- `docs/automation.md` and the established Prompt 399 browser workflow govern
  responsive verification; re-read before taking new measurements.

## SKILLS USED

- `frontend-design` — preserve the approved photographic composition while
  removing the requested text.
- `vercel-react-best-practices` — keep the existing server page and boundaries.
- `web-design-guidelines` — check image descriptions and changed markup.
- `playwright` — verify the caption-free page at the three reference widths.
- `requesting-code-review` — dispatch the required independent reviewer after
  successful self-verification.
- `receiving-code-review` — verify and resolve any concrete review feedback.
- `caveman-commit` — generate the final local commit message.

No new utility, token, primitive, motion API or package is required. Load another
owning skill only if an actual integration defect expands that scope.

## Implementation

1. Re-read this prompt and the owning records. Check status/branch/HEAD and
   preserve unrelated work.
2. In `client/app/(marketing)/page.tsx`, remove the three complete `figcaption`
   elements for Melbourne, Ladenburg and Espoo. Remove the unused `captionClass`
   constant and the obsolete comment about keeping captions outside the media
   entrance. Keep the figure/media wrappers and existing motion hooks; removing
   the caption children is sufficient and avoids unnecessary markup churn.
3. Preserve each image's meaningful alt text, source, reserved box, focal
   position, `sizes`, quality, loading and priority. Keep all page copy outside
   the captions, actions, anchors, shared chrome and responsive grids.
4. Update `SOURCES.md` to say the credits are retained in the manifest and are
   no longer rendered in the UI by this user request. Remove the present-tense
   statement that captions remain on white. Preserve every source/author/licence
   fact and asset-processing detail.
5. After successful checks and review, append a dated Prompt 400 record to
   `docs/landing.md`. Explain that this user-requested deletion supersedes the
   Prompt 399 visible-caption decision; preserve its historical measurements.
   No token or design-system change is needed.

## Reference deltas

The approved Prompt 399 page loses all three visible location/credit lines and
those lines' 12px top margins. This user request authorizes that bounded delta.
Photo dimensions/crops do not change; following content naturally moves upward
by the removed caption footprint. Add no replacement spacer or hidden caption.
The existing meaningful alt text remains available to assistive technology.

## Breakpoint behaviour

- **375px:** both stacked hero photos and the detail photo have no credit line;
  the existing inter-photo grid gap and photo ratios remain.
- **800px:** the paired hero photos keep their 2:1 tracks and 360px height;
  neither has a caption; the wide detail photo has none.
- **1280px:** the paired hero photos retain their 440px height and the detail
  photo its portrait ratio; all three credit lines disappear.

No new visual measurement is needed to choose values. Verify actual image-box
geometry against the recorded Prompt 399 dimensions; do not infer it from the
screenshot or reapply obsolete full-page pixel fidelity.

## Verification and completion

- Use existing Prettier with `--no-semi` for the changed TSX and normal Markdown
  formatting for this prompt/manifest/new record. Run `git diff --check`.
- Run root `npm run typecheck`, `npm run build`, and `npm run lint`, recording
  actual output and exit status. Run build and lint sequentially: build regenerates
  Prisma types and previously caused transient lint failures when concurrent.
  Use the installed Node 24 runtime; use the established escalation for the
  sandbox's empty TypeScript child-stdout issue if it reproduces.
- Inspect the page in a browser at 375, 800 and 1280 after fonts/images load.
  Confirm zero `figcaption` elements in main and no visible “Photo by” or
  “Unsplash” strings. Verify all three photos decode, meaningful alts remain,
  their boxes/crops are unchanged, and there is no horizontal overflow.
- Check the existing hero and detail media entrances settle visibly and that
  the two hero actions still work. No new automated test suite is needed for
  this reversible static deletion.
- Fetch the fresh interface guidelines for the changed-page audit. Preserve
  image accessibility, focus and semantic structure.
- Dispatch an independent reviewer with this prompt, baseline/current SHAs,
  uncommitted diff and actual checks/browser evidence. Evaluate feedback before
  changing anything; re-review significant fixes.
- Record completion, stage only this scope and commit to local `main` using
  `caveman-commit`. No push or deployment.
- Preview steps: `npm run dev:client`, then open `http://localhost:3000/` or the
  actual port Next prints. Reverting the scoped commit restores the captions.

Expected files: this prompt, the marketing page, photography source manifest,
and the appended landing record. No image assets or shared styles change.
