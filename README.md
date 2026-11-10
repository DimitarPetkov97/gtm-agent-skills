# gtm-agent-skills

Small, practical agent skills for go-to-market work: the kind of checks and chores you'd otherwise do by eyeball before hitting send. Each skill is a self-contained folder with plain-language instructions any LLM can follow, plus a zero-dependency script when code execution is available. The first skill is a cold email spam checker.

## Skills

| Skill | What it does |
|---|---|
| [`cold-email-spam-check`](cold-email-spam-check/) | Scores a cold email 0–100 (lower is better) for spam-trigger signals: 355 weighted terms in 9 categories, links, caps, punctuation, emojis, length and subject-line issues. Shows what was flagged, where, and how to reword it. |

## Install and use

### Claude Code

Copy the skill folder into your skills directory:

```bash
# personal, available everywhere
cp -r cold-email-spam-check ~/.claude/skills/

# or per project
mkdir -p .claude/skills && cp -r cold-email-spam-check .claude/skills/
```

Then ask something like "spam-check this cold email" and paste the email.

### Codex

Codex reads `AGENTS.md`. Copy `cold-email-spam-check/` into your repo (or reference it from your own `AGENTS.md`) and point it at `cold-email-spam-check/AGENTS.md` and `SKILL.md`. Or paste the contents of those two files into the session.

### Grok or any other LLM

Paste `cold-email-spam-check/SKILL.md` as the instructions, then paste your email. If the model can't run code, it applies the term list in `data/spam-trigger-words.json` by hand using the scoring rules in the skill. Attach the JSON file too if you can.

### Run the script directly

Needs Node 18+. No dependencies, no network.

```bash
cd cold-email-spam-check
node scripts/spam_check.mjs examples/sample-email.txt
node scripts/spam_check.mjs --subject "Quick question" email.txt
cat email.txt | node scripts/spam_check.mjs --json
node --test scripts/spam_check.test.mjs
```

## Learn more

- Free browser version: <https://leadhaste.com/resources/tools/email-spam-checker>
- The full list and why these words matter: <https://leadhaste.com/resources/spam-trigger-words>

## License

MIT. See [LICENSE](LICENSE).
