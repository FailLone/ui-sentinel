# Model-generated investigation fixtures

These JSON programs were copied without edits from real DeepSeek receipts. Provenance identifies the source run and build. They are private regression data, not agent prompts, built-in rules, or approved global rules.

The three files in this directory preserve the first complete discovery batch, including rejected candidates:

| File | Broken / healthy replay | Meaning |
| --- | --- | --- |
| menu.json | fail / pass | Distinguishes this pair |
| feedback.json | fail / fail | Rejected: adds an unrequested relative-position expectation |
| layout.json | fail / fail | Rejected: binds an empty paragraph instead of loaded feedback |

`paired-controls/` holds subsequent programs that distinguish all three pairs with the same production runner. Menu and feedback come from one batch; layout comes from a later targeted retest after fixing progress accounting. This is not evidence that one final six-case model matrix passed or that all future model-generated programs are correct.

`evaluation/support/program-replay.test.ts` replays every original program unchanged in real Chromium. For measurement-only programs the evaluator prepares the documented public state; layout's later program includes its own click and wait. That preparation is not credited as model-generated setup. Healthy controls are necessary: a program can produce a real failing comparison while its expectation or target is wrong.
