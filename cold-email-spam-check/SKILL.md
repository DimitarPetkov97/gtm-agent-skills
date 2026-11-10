---
name: cold-email-spam-check
description: Check a cold email (subject and body) for spam-trigger signals and return a 0–100 spam score (lower is better) with a rating, flagged words by category with positions, a "why this score" breakdown and suggested rewrites. Use when the user wants to spam-check, lint or improve deliverability of a cold email or outreach template.
---

# Cold email spam check

Scores a cold email from 0 to 100. Lower is better. It is a text-only check of the wording and formatting; it does not test DNS, authentication or sender reputation.

## 1. If you can run code

Node 18+ is required. No installs, no network.

```bash
node scripts/spam_check.mjs --subject "Subject here" email.txt
cat email.txt | node scripts/spam_check.mjs --json
```

- Input is a file path, `-` for stdin, or a trailing argument holding the text.
- `--subject "..."` sets the subject. Without it, a leading `Subject:` line in the input is used as the subject (a blank line after it is fine).
- `--json` prints `score`, `rating`, `scoreBreakdown`, `categoryHits`, `totalTriggerHits`, `findings`, `stats` and a `flags` array (term, category, weight, character `index`, `suggestedRewrite`).
- Paths are relative to this skill folder. Flag positions are character indexes into `subject + "\n" + body`.

## 2. If you cannot run code

Do the same thing by hand. Be exact; do not estimate.

**Terms.** `data/spam-trigger-words.json` has 9 categories (in severity order) and 355 terms. Each category has a `weight`. If a term appears in more than one category, only the first one counts. Matching is case-insensitive over `full = subject + "\n" + body`. A term that starts and ends with a letter or digit must match as a whole word; otherwise it matches as plain text. Overlapping terms can both count (for example "free trial" and "free").

| Category | Weight |
|---|---|
| shady | 6 |
| pharma | 5 |
| gambling | 5 |
| overpromise | 4 |
| money | 3 |
| urgency | 3 |
| greetings | 3 |
| cta | 2 |
| salesy | 1 |

**Word score.** Each hit adds its category weight. A category's points are capped at 18, then the sum over categories is capped at 55. This is the "Spam-trigger words" item.

**Other signals** (body = email body only; full = subject + newline + body):

| Signal | Points |
|---|---|
| URL shortener anywhere in full (bit.ly, tinyurl.com, goo.gl, t.co, ow.ly, buff.ly, rebrand.ly, cutt.ly, is.gd, shorturl.at, rb.gy, tiny.cc, lnkd.in) | +12 |
| More than 2 links (`http(s)://...` in body) | +min((links − 2) × 8, 20) |
| More than 1 ALL-CAPS word in body (3+ characters, has a capital letter, equals its uppercase form) | +min(count × 5, 15) |
| Two or more `!` in a row in full | +8 |
| Otherwise, more than 1 `!` in full | +min(count × 4, 12) |
| More than 2 emojis in full | +min((emojis − 2) × 3, 12) |
| `$$`, `€€` or `££` in full | +8 |
| Body under 25 words (and not empty) | +5 |
| Body over 200 words | +6 |
| Subject over 60 characters | +4 |
| `!` in subject | +5 |
| Subject is all caps (has 4+ consecutive capitals) | +8 |
| Subject starts with `Re:`, `Fw:` or `Fwd:` | +6 |
| Emoji in subject | +3 |

Add everything, round, and clamp to 0–100. Subject checks apply only if the subject is not blank.

**Rating:** 0–15 Excellent, 16–35 Good, 36–60 Needs work, 61–100 High risk.

## 3. How to report

1. **Score** out of 100 (lower is better) and the **rating**.
2. **Why this score:** each non-zero item with its points, largest first.
3. **Flagged words by category:** category name, count, points, and each match with its character position. List the heaviest categories first.
4. **Suggested rewrites** for flagged terms. Say what you actually do or ask in plain, specific language, for example "increase sales" becomes "cut quote turnaround from 3 days to 1". Rewrites are advice only; they do not change the score.
5. **Findings:** a short list of what to fix first, and what already looks fine.

Keep the tone helpful. Flagged words are not automatically bad; they signal a promotional tone.

## More

- Free browser tool: https://leadhaste.com/resources/tools/email-spam-checker
- Spam trigger words explained: https://leadhaste.com/resources/spam-trigger-words
