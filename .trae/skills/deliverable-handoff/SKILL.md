---
name: "deliverable-handoff"
description: "Hands task deliverables to the user as downloadable files: saves final outputs under /workspace, links them with computer:// in the closing summary, and zips multi-file results. Invoke at the end of any task that produces user-facing output files, or when the user asks how to get/download the results."
---

# Deliverable Handoff

Make sure the user can actually take the results away after a task finishes — without requiring git knowledge or a running server.

## Rules

1. **Final deliverables live under `/workspace`.**
   Keep intermediate-only artifacts (drafts, debug scripts, test outputs, caches, temp files) outside it (e.g. `/tmp`) so the download surface stays clean.

2. **Link every user-facing deliverable in the closing summary.**
   Use `computer://` links with human-readable text, one per artifact:

   ```markdown
   - [月度报表.xlsx](computer:///workspace/月度报表.xlsx)
   - [成果打包 site.zip](computer:///workspace/site.zip)
   ```

   A user who only reads the last message must be able to find and download everything.

3. **Multi-file deliverables get zipped.**
   When the result spans several files/directories (a site, a dataset + charts + report), bundle them into one archive named after the project, place it in `/workspace`, and link it. Do this proactively — don't wait to be asked. Offer it when the set is borderline (2–3 loose files).

4. **Git is optional, never a requirement.**
   `git push` / GitHub Pages is only used when the user explicitly wants version control or a public URL. Default to local file handoff.

5. **Web deliverables: note how to use them.**
   For standalone HTML outputs, mention that the file opens offline by double-click (if true — e.g. zero dependencies, inlined assets), and that Ctrl+S on the preview also saves a working copy. Never point the user at a `localhost` URL as the only way to access a deliverable, because local servers die with the session.

6. **Prefer editing existing deliverables over creating duplicates.**
   Re-running a task should update the same artifact (same filename) and the summary should link the updated file.

## Checklist before finishing a task with outputs

- [ ] All final files saved under `/workspace`
- [ ] No intermediate/debug junk in `/workspace`
- [ ] Multi-file result zipped (archive in `/workspace`)
- [ ] Closing summary lists each deliverable as a `computer://` link
- [ ] For HTML: said whether it opens offline / how to save it
