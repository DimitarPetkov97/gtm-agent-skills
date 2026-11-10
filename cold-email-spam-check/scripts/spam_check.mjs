#!/usr/bin/env node
/* Cold-email spam checker. Zero dependencies, Node 18+, no network.
   Scoring is a faithful port of the LeadHaste site checker
   (https://leadhaste.com/resources/tools/email-spam-checker). */
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, "..", "data", "spam-trigger-words.json");

export const DATA = JSON.parse(readFileSync(DATA_PATH, "utf8"));
export const SPAM_CATEGORIES = DATA.categories;

/* ── Suggested rewrites (additive only, never affect the score) ── */
export const GENERIC_REWRITE =
  "Say this in plain, specific language, e.g. what you actually do or ask.";
export const REWRITES = {
  "act now": "If it's useful, I can send details this week.",
  "limited time": "Mention the real date or constraint, if there is one.",
  "limited time offer": "Mention the real date or constraint, if there is one.",
  "click here": "Reply and I'll send the link.",
  "click below": "Reply and I'll send the link.",
  "free": "Say what is included, or drop the word.",
  "free trial": "a two-week pilot (state the real terms)",
  "free consultation": "a 15-minute call",
  "100% guaranteed": "Describe the specific result a customer got.",
  "risk free": "Explain how a customer can cancel or opt out.",
  "risk-free": "Explain how a customer can cancel or opt out.",
  "no obligation": "You can say no at any point.",
  "satisfaction guaranteed": "Describe your actual refund or support policy.",
  "amazing": "Name the specific benefit (e.g. 'cut onboarding from 5 days to 2').",
  "incredible": "Name the specific benefit with a number or example.",
  "increase sales": "Say how much, for whom, and over what time.",
  "double your money": "Cite a realistic, specific outcome, or leave it out.",
  "double your income": "Cite a realistic, specific outcome, or leave it out.",
  "double your": "Cite a realistic, specific outcome, or leave it out.",
  "get rich quick": "Remove it; it reads as a scam.",
  "congratulations": "Open with something specific about the recipient.",
  "dear friend": "Use the recipient's first name.",
  "call": "Ask a direct question, e.g. 'Worth 15 minutes next week?'",
  "sign up now": "Ask a low-friction question instead.",
  "get started now": "Ask a low-friction question instead.",
  "exclusive offer": "Say who it is for and why.",
  "special offer": "Say what the offer actually is.",
  "financial freedom": "Describe the concrete outcome you help with.",
  "mortgage": "Only use if it's literally your topic; otherwise be specific.",
  "casino": "Remove; it's a gambling trigger.",
  "i hope this email finds you well": "Start with the reason you're writing.",
  "touch base": "Say what you want to discuss.",
};
export function suggestRewrite(term) {
  return REWRITES[term.toLowerCase()] ?? GENERIC_REWRITE;
}

/* ── Compile terms once; first (most severe) category wins ── */
function makeRegex(term) {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordEdges = /^[a-z0-9]/i.test(term) && /[a-z0-9]$/i.test(term);
  return new RegExp(wordEdges ? `\\b${esc}\\b` : esc, "gi");
}

export const COMPILED = (() => {
  const seen = new Set();
  const out = [];
  for (const cat of SPAM_CATEGORIES) {
    for (const raw of cat.terms) {
      const term = raw.toLowerCase();
      if (seen.has(term)) continue;
      seen.add(term);
      out.push({
        term,
        categoryId: cat.id,
        categoryLabel: cat.label,
        weight: cat.weight,
        re: makeRegex(term),
      });
    }
  }
  return out;
})();

export const URL_SHORTENERS = [
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "buff.ly", "rebrand.ly",
  "cutt.ly", "is.gd", "shorturl.at", "rb.gy", "tiny.cc", "lnkd.in",
];

/* Every flagged match with its character index in `subject + "\n" + body`. */
export function findFlags(subject, body) {
  const full = `${subject}\n${body}`;
  const flags = [];
  for (const c of COMPILED) {
    for (const m of full.matchAll(new RegExp(c.re.source, "gi"))) {
      flags.push({
        term: c.term,
        matched: m[0],
        category: c.categoryId,
        categoryLabel: c.categoryLabel,
        weight: c.weight,
        index: m.index,
        suggestedRewrite: suggestRewrite(c.term),
      });
    }
  }
  return flags.sort((a, b) => a.index - b.index || a.term.localeCompare(b.term));
}

export function checkSpamContent(subject, body) {
  const full = `${subject}\n${body}`;
  const findings = [];

  /* Trigger words, grouped by category */
  const catMap = new Map();
  for (const c of COMPILED) {
    const matches = full.match(c.re);
    if (!matches?.length) continue;
    const meta = SPAM_CATEGORIES.find((s) => s.id === c.categoryId);
    let hit = catMap.get(c.categoryId);
    if (!hit) {
      hit = { id: meta.id, label: meta.label, emoji: meta.emoji, count: 0, points: 0, words: [] };
      catMap.set(c.categoryId, hit);
    }
    hit.words.push({ word: c.term, count: matches.length });
    hit.count += matches.length;
    hit.points += matches.length * c.weight;
  }
  const categoryHits = [...catMap.values()]
    .map((h) => ({ ...h, words: h.words.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.points - a.points);
  const totalTriggerHits = categoryHits.reduce((a, b) => a + b.count, 0);

  let score = 0;
  const scoreBreakdown = [];
  const add = (label, points) => {
    if (points > 0) {
      score += points;
      scoreBreakdown.push({ label, points });
    }
  };

  const wordScore = Math.min(
    categoryHits.reduce((sum, c) => sum + Math.min(c.points, 18), 0),
    55
  );
  add("Spam-trigger words", wordScore);

  if (totalTriggerHits === 0) {
    findings.push({ severity: "pass", message: "No spam-trigger words detected." });
  } else {
    const top = categoryHits[0];
    findings.push({
      severity: wordScore >= 24 ? "fail" : "warn",
      message: `${totalTriggerHits} spam-trigger word${totalTriggerHits > 1 ? "s" : ""} across ${categoryHits.length} categor${categoryHits.length > 1 ? "ies" : "y"} (most in "${top.label}"). They aren't automatically bad, but this density reads promotional. Rewrite the flagged terms in plain, specific language.`,
    });
  }

  /* Stats */
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const characters = body.length;
  const readingSeconds = Math.round((wordCount / 200) * 60);
  const links = (body.match(/https?:\/\/[^\s)]+/gi) || []).length;
  const capsWords = words.filter((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  const exclamations = (full.match(/!/g) || []).length;
  const emojis = (full.match(/\p{Extended_Pictographic}/gu) || []).length;

  /* Links */
  const shortenerHit = URL_SHORTENERS.some((s) => full.toLowerCase().includes(s));
  if (shortenerHit) {
    add("Shortened URL", 12);
    findings.push({ severity: "fail", message: "A URL shortener (bit.ly, tinyurl, etc.) is present. Shortened links hide the destination and are a strong spam signal. Link to your real domain instead." });
  }
  if (links > 2) {
    add("Too many links", Math.min((links - 2) * 8, 20));
    findings.push({
      severity: links > 4 ? "fail" : "warn",
      message: `${links} links. Cold emails with more than 1–2 links get filtered more often. Keep it to one, or none on the first touch.`,
    });
  } else {
    findings.push({ severity: "pass", message: `${links} link${links === 1 ? "" : "s"}, within a safe range for cold outreach.` });
  }

  /* ALL CAPS */
  if (capsWords > 1) {
    add("ALL-CAPS words", Math.min(capsWords * 5, 15));
    findings.push({
      severity: capsWords > 3 ? "fail" : "warn",
      message: `${capsWords} ALL-CAPS words. Caps read as shouting to both people and filters. Use normal sentence case.`,
    });
  }

  /* Exclamation marks */
  if (/!{2,}/.test(full)) {
    add("Repeated exclamation marks", 8);
    findings.push({ severity: "fail", message: "Repeated exclamation marks (!!) are a classic spam signal. Use none in a B2B email." });
  } else if (exclamations > 1) {
    add("Exclamation marks", Math.min(exclamations * 4, 12));
    findings.push({
      severity: exclamations > 3 ? "fail" : "warn",
      message: `${exclamations} exclamation marks. One is plenty in a B2B email; several look promotional.`,
    });
  }

  /* Emojis */
  if (emojis > 2) {
    add("Emojis", Math.min((emojis - 2) * 3, 12));
    findings.push({
      severity: emojis > 4 ? "fail" : "warn",
      message: `${emojis} emojis. A single tasteful emoji can be fine; several make a cold email look like a marketing newsletter.`,
    });
  }

  /* Currency symbols */
  if (/\${2,}|€{2,}|£{2,}/.test(full)) {
    add("Currency symbols ($$$)", 8);
    findings.push({ severity: "fail", message: "Repeated currency symbols ($$$) are a textbook spam pattern. Remove them." });
  }

  /* Length */
  if (wordCount > 0 && wordCount < 25) {
    add("Too short", 5);
    findings.push({
      severity: "warn",
      message: `Only ${wordCount} words. Extremely short emails with a link can look like spam. Add a sentence of genuine context.`,
    });
  } else if (wordCount > 200) {
    add("Too long", 6);
    findings.push({
      severity: "warn",
      message: `${wordCount} words. Cold emails over ~150 words get fewer replies. Tighten it.`,
    });
  } else if (wordCount >= 25) {
    findings.push({ severity: "pass", message: `${wordCount} words, a good length for a cold email.` });
  }

  /* Subject line */
  if (subject.trim()) {
    if (subject.length > 60) {
      add("Subject too long", 4);
      findings.push({ severity: "warn", message: `Subject is ${subject.length} characters. It'll be truncated on mobile. Aim for under 50.` });
    }
    if (/!/.test(subject)) {
      add("Exclamation in subject", 5);
      findings.push({ severity: "warn", message: "Exclamation mark in the subject line is a classic spam signal. Remove it." });
    }
    if (subject === subject.toUpperCase() && /[A-Z]{4,}/.test(subject)) {
      add("ALL-CAPS subject", 8);
      findings.push({ severity: "fail", message: "An ALL-CAPS subject line is one of the strongest spam triggers." });
    }
    if (/^\s*(re|fwd?)\s*:/i.test(subject)) {
      add('Fake "Re:" / "Fwd:" subject', 6);
      findings.push({ severity: "fail", message: 'A fake "Re:" or "Fwd:" prefix on a first-touch email is deceptive. Recipients and filters both penalize it.' });
    }
    if (/\p{Extended_Pictographic}/u.test(subject)) {
      add("Emoji in subject", 3);
      findings.push({ severity: "warn", message: "Emoji in the subject line skews promotional for cold B2B outreach." });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const rating = score <= 15 ? "Excellent" : score <= 35 ? "Good" : score <= 60 ? "Needs work" : "High risk";

  return {
    score,
    rating,
    scoreBreakdown: scoreBreakdown.sort((a, b) => b.points - a.points),
    categoryHits,
    totalTriggerHits,
    findings,
    stats: { words: wordCount, characters, readingSeconds, links, capsWords, exclamations, emojis },
  };
}

/* Full report = score result + positioned flags (flags never affect score). */
export function analyze(subject, body) {
  return { subject, ...checkSpamContent(subject, body), flags: findFlags(subject, body) };
}

/* If no explicit subject, split a leading "Subject:" line off the input. */
export function splitSubject(text) {
  const m = text.match(/^\s*Subject:[ \t]*([^\r\n]*)(?:\r?\n)?(?:[ \t]*\r?\n)?/i);
  if (!m) return { subject: "", body: text };
  return { subject: m[1].trim(), body: text.slice(m[0].length) };
}

/* ── Formatting ── */
export function formatReport(r) {
  const L = [];
  L.push(`Spam score: ${r.score}/100 (lower is better)`);
  L.push(`Rating: ${r.rating}`);
  if (r.subject) L.push(`Subject: ${r.subject}`);
  L.push("");
  L.push("Why this score:");
  if (!r.scoreBreakdown.length) L.push("  (nothing added, clean)");
  for (const b of r.scoreBreakdown) L.push(`  +${b.points}  ${b.label}`);

  L.push("");
  L.push(`Flagged terms: ${r.totalTriggerHits}`);
  const byCat = new Map();
  for (const f of r.flags) {
    if (!byCat.has(f.category)) byCat.set(f.category, []);
    byCat.get(f.category).push(f);
  }
  for (const h of r.categoryHits) {
    L.push(`  ${h.emoji} ${h.label}: ${h.count} hit${h.count === 1 ? "" : "s"}, ${h.points} pts`);
    for (const f of byCat.get(h.id) || []) {
      L.push(`    - "${f.matched}" at position ${f.index}`);
    }
  }

  if (r.flags.length) {
    L.push("");
    L.push("Suggested rewrites:");
    const done = new Set();
    for (const f of r.flags) {
      if (done.has(f.term)) continue;
      done.add(f.term);
      L.push(`  "${f.term}" -> ${f.suggestedRewrite}`);
    }
  }

  L.push("");
  L.push("Findings:");
  for (const f of r.findings) L.push(`  [${f.severity}] ${f.message}`);

  const s = r.stats;
  L.push("");
  L.push(
    `Stats: ${s.words} words, ${s.characters} characters, ~${s.readingSeconds}s read, ${s.links} links, ` +
      `${s.capsWords} ALL-CAPS words, ${s.exclamations} exclamation marks, ${s.emojis} emojis`
  );
  return L.join("\n") + "\n";
}

const USAGE = `Usage: node spam_check.mjs [options] [file | - | "email text"]

Checks a cold email for spam-trigger signals and prints a 0-100 score
(lower is better).

Input:
  file        Path to a text file holding the email body
  -           Read from stdin (also the default when stdin is piped)
  "text"      A trailing argument that is not an existing file is used as the body

Options:
  --subject "..."   Subject line. If omitted and the input starts with a
                    "Subject:" line, that line is used as the subject.
  --json            Print machine-readable JSON
  -h, --help        Show this help

Exit codes: 0 success, 2 usage error.
`;

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv) {
  let subject = null;
  let json = false;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { process.stdout.write(USAGE); return 0; }
    else if (a === "--json") json = true;
    else if (a === "--subject") {
      if (i + 1 >= argv.length) { process.stderr.write("Error: --subject needs a value\n\n" + USAGE); return 2; }
      subject = argv[++i];
    } else if (a.startsWith("--subject=")) subject = a.slice(10);
    else if (a.startsWith("--")) { process.stderr.write(`Error: unknown option ${a}\n\n` + USAGE); return 2; }
    else rest.push(a);
  }
  if (rest.length > 1) { process.stderr.write("Error: expected a single input\n\n" + USAGE); return 2; }

  let text;
  if (rest.length === 1 && rest[0] !== "-") {
    const arg = rest[0];
    text = existsSync(arg) && statSync(arg).isFile() ? readFileSync(arg, "utf8") : arg;
  } else if (rest[0] === "-" || !process.stdin.isTTY) {
    text = await readStdin();
  } else {
    process.stderr.write("Error: no input provided\n\n" + USAGE);
    return 2;
  }

  let body = text;
  if (subject === null) ({ subject, body } = splitSubject(text));
  const report = analyze(subject, body);
  process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatReport(report));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  });
}
