---
name: sagewrite-write-chapters
description: Generate new SageWrite manuscript sections from an approved objective.md and toc.md through the existing stage 03, then report the existing batch inspection. Use for one selected TOC unit, a continuous range, or an explicitly requested full manuscript; not for defining the book, generating a TOC, revising prose, translating, or editorial review.
---

# SageWrite Write Chapters

## Use the original programs

Use the registered `sagewrite_write_chapters` MCP tool. If unavailable, invoke the existing `engine/03-write.ps1` directly with its documented parameters. Do not create any temporary PS1, validation wrapper, handoff response, or alternate writing workflow. Do not delegate section prose.

Read the current `engine/llm-config.json` before a model-backed run. Preserve its selected provider and default model; do not override `SAGE_LLM_PROVIDER`, `SAGE_LLM_API_STYLE`, `SAGE_LLM_MODEL`, or `SAGE_LLM_CONFIG`. Current mode is synchronous `codex` / `codex-exec`. Report CLI, login, model or script failures instead of switching modes. If `SAGE_AGENT_PENDING` appears, stop and report the unexpected legacy handoff.

## Select the book and units

Resolve the intended `workspace-<BookName>/sagewrite/book`. Stage 03 uses `00_brief/objective.md` and `01_outline/toc.md`; it does not use `toc2.md`. Use `sagewrite-generate-toc` first if the structural TOC is absent or not approved.

Resolve the user's selection against the actual TOC. The existing writer numbers `###` writing units, falling back to `##` when no `###` exists. An ambiguous book or unit selection needs clarification.

Pass an explicit selection:

- one unit: `Chapter`;
- a continuous inclusive range: `StartChapter` and `EndChapter`;
- omit the selection only for an explicitly requested complete manuscript.

Pass `bookName`, `workspaceRoot`, the selection and only the options the user requested. `MaxTokens` is a token limit, not a Chinese character count. Enable `ReferenceGlossary` only when requested. Use `AdditionalInstructions` only for approved requirements.

Stage 03 skips existing drafts by default. Do not use `Force` to retry. Replacement requires explicit user authorization and backups of affected drafts and rewrite notes. Preserve unrelated files and do not run concurrent writers for one book.

## Use the existing inspection once

After stage 03 finishes, call `sagewrite_workflow_status` once for the same book and workspace, with its default scope and compact output. If MCP is unavailable, invoke the existing `Get-SageWriteWorkflowStatus.ps1` with `BookName` and the resolved `BookRoot`.

The default scope is the latest batch's actual generated files. Do not request `fullBook`, include skipped old drafts or unwritten units, or expand an unavailable scope to the whole book.

Report only the inspection program's returned counts, states, warnings and affected unit numbers. Do not supplement its result with generated shell checks, new PS1 files, manual frontmatter audits, word-count comparisons, residue searches, or model judgments of style, facts or continuity. Do not repeatedly change commands to work around an inspection failure; report the failure. Do not automatically rewrite an affected draft.

A `present_unverified` result means only that the program's existing file/nonempty/title checks passed. It does not mean editorial acceptance. If nothing was generated, report that there are no new files to inspect.

## Report the run

Use stage 03's existing run record for generated, skipped and failed counts. Summarize the inspection result and stop. Do not add unimplemented verification requirements or recreate statistics with custom commands.

When reporting token use, quote the existing batch totals recorded by stage 03. Missing usage remains unavailable. Cached input is already included in input; main Agent usage is separate. Inspect detailed `llm_usage.jsonl` records only when the user specifically asks for a usage analysis, not as an extra routine validation.

These are manuscript drafts. Content review and export remain separate existing workflows and are not part of this writing Skill.
