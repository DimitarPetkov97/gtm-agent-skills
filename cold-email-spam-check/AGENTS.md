# Cold email spam check

When asked to check a cold email for spam risk, read `SKILL.md` in this folder and follow it.

- If you can run code, use Node 18+: `node scripts/spam_check.mjs [--subject "..."] [--json] <file | ->`
- If you can't, apply `data/spam-trigger-words.json` by hand with the scoring rules in `SKILL.md`.
- Report the 0–100 score (lower is better), the rating, a "why this score" breakdown, flagged words by category with positions, and suggested rewrites.
- Run the tests with `node --test scripts/spam_check.test.mjs`.
