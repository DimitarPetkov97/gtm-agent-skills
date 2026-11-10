import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSpamContent, analyze, findFlags, splitSubject, COMPILED, SPAM_CATEGORIES, DATA, suggestRewrite } from "./spam_check.mjs";

// Inputs (identical to the strings used to produce the golden values)
const INPUTS = [
  {
    name: "site-sample",
    subject: "Quick question for {{firstName}}",
    body: `Hi {{firstName}}, I hope this email finds you well. I just wanted to reach out because I was hoping we could touch base about how our amazing platform can help you increase sales. Our solution is used by thousands of companies and it has been proven to deliver incredible results, so I really think it would be a great fit for your team going forward. Let me know if you'd be open to a quick call!`,
  },
  {
    name: "clean-professional",
    subject: "Question about your Q4 pipeline review",
    body: `Hi Sarah,\n\nI noticed your team published a write-up on how you run quarterly pipeline reviews. I'm putting together a similar process at a 40-person shop and had one specific question about how you handle deals that stall after the demo.\n\nWould you have 15 minutes this week to compare notes?\n\nThanks,\nAlex`,
  },
  {
    name: "spammy-blast",
    subject: "ACT NOW!!! You have been selected 💰",
    body: `Dear friend,\n\nCongratulations! You are a winner!!! Click here to claim your prize and get rich quick. This is a limited time offer — act now, no obligation, 100% guaranteed, risk free!!!\nVisit https://bit.ly/winbig and https://example.com/buy and https://example.com/now for your FREE money and casino bonus.\n$$$ DON'T MISS OUT $$$`,
  },
  {
    name: "overlaps-and-free",
    subject: "Re: Special offer inside",
    body: `We have a free trial and a 100% free consultation. Satisfaction guaranteed. Click below to sign up now and get started now. This exclusive offer expires today.`,
  },
  {
    name: "too-short-with-link",
    subject: "Hey",
    body: `See this: https://example.com/x`,
  },
  {
    name: "too-long-caps-links",
    subject: "A really unnecessarily long subject line that will definitely get truncated on most mobile clients today",
    body: ("PLEASE REVIEW this update. " + "We added context about our work together and how the report is structured. ").repeat(40)
      + " https://a.example.com http://b.example.com https://c.example.com https://d.example.com https://e.example.com",
  },
  {
    name: "double-money",
    subject: "thoughts",
    body: `Curious if you have tried to double your money or double your income this year. Also a short note about mortgage rates and financial freedom for a mid-size firm.`,
  },
];


// Golden values captured from the live LeadHaste site function
const GOLDEN = [
 {
  "name": "site-sample",
  "score": 10,
  "rating": "Excellent",
  "totalTriggerHits": 4,
  "scoreBreakdown": [
   {
    "label": "Spam-trigger words",
    "points": 10
   }
  ],
  "categoryHits": [
   {
    "id": "overpromise",
    "count": 2,
    "points": 8,
    "words": [
     {
      "word": "amazing",
      "count": 1
     },
     {
      "word": "incredible",
      "count": 1
     }
    ]
   },
   {
    "id": "salesy",
    "count": 2,
    "points": 2,
    "words": [
     {
      "word": "increase sales",
      "count": 1
     },
     {
      "word": "call",
      "count": 1
     }
    ]
   }
  ],
  "findings": [
   {
    "severity": "warn",
    "message": "4 spam-trigger words across 2 categories (most in \"Overpromise / hype\"). They aren't automatically bad, but this density reads promotional. Rewrite the flagged terms in plain, specific language."
   },
   {
    "severity": "pass",
    "message": "0 links, within a safe range for cold outreach."
   },
   {
    "severity": "pass",
    "message": "76 words, a good length for a cold email."
   }
  ],
  "stats": {
   "words": 76,
   "characters": 397,
   "readingSeconds": 23,
   "links": 0,
   "capsWords": 0,
   "exclamations": 1,
   "emojis": 0
  }
 },
 {
  "name": "clean-professional",
  "score": 0,
  "rating": "Excellent",
  "totalTriggerHits": 0,
  "scoreBreakdown": [],
  "categoryHits": [],
  "findings": [
   {
    "severity": "pass",
    "message": "No spam-trigger words detected."
   },
   {
    "severity": "pass",
    "message": "0 links, within a safe range for cold outreach."
   },
   {
    "severity": "pass",
    "message": "53 words, a good length for a cold email."
   }
  ],
  "stats": {
   "words": 53,
   "characters": 306,
   "readingSeconds": 16,
   "links": 0,
   "capsWords": 0,
   "exclamations": 0,
   "emojis": 0
  }
 },
 {
  "name": "spammy-blast",
  "score": 100,
  "rating": "High risk",
  "totalTriggerHits": 27,
  "scoreBreakdown": [
   {
    "label": "Spam-trigger words",
    "points": 55
   },
   {
    "label": "ALL-CAPS words",
    "points": 15
   },
   {
    "label": "Shortened URL",
    "points": 12
   },
   {
    "label": "Too many links",
    "points": 8
   },
   {
    "label": "Repeated exclamation marks",
    "points": 8
   },
   {
    "label": "Currency symbols ($$$)",
    "points": 8
   },
   {
    "label": "Exclamation in subject",
    "points": 5
   },
   {
    "label": "Emoji in subject",
    "points": 3
   }
  ],
  "categoryHits": [
   {
    "id": "shady",
    "count": 10,
    "points": 60,
    "words": [
     {
      "word": "risk free",
      "count": 1
     },
     {
      "word": "no obligation",
      "count": 1
     },
     {
      "word": "100% guaranteed",
      "count": 1
     },
     {
      "word": "you are a winner",
      "count": 1
     },
     {
      "word": "you have been selected",
      "count": 1
     },
     {
      "word": "claim your prize",
      "count": 1
     },
     {
      "word": "get rich",
      "count": 1
     },
     {
      "word": "get rich quick",
      "count": 1
     },
     {
      "word": "free money",
      "count": 1
     },
     {
      "word": "winner",
      "count": 1
     }
    ]
   },
   {
    "id": "urgency",
    "count": 6,
    "points": 18,
    "words": [
     {
      "word": "act now",
      "count": 2
     },
     {
      "word": "limited time",
      "count": 1
     },
     {
      "word": "limited time offer",
      "count": 1
     },
     {
      "word": "don't miss",
      "count": 1
     },
     {
      "word": "don't miss out",
      "count": 1
     }
    ]
   },
   {
    "id": "gambling",
    "count": 2,
    "points": 10,
    "words": [
     {
      "word": "casino",
      "count": 1
     },
     {
      "word": "casino bonus",
      "count": 1
     }
    ]
   },
   {
    "id": "greetings",
    "count": 2,
    "points": 6,
    "words": [
     {
      "word": "dear friend",
      "count": 1
     },
     {
      "word": "congratulations",
      "count": 1
     }
    ]
   },
   {
    "id": "salesy",
    "count": 5,
    "points": 5,
    "words": [
     {
      "word": "free",
      "count": 2
     },
     {
      "word": "offer",
      "count": 1
     },
     {
      "word": "bonus",
      "count": 1
     },
     {
      "word": "prize",
      "count": 1
     }
    ]
   },
   {
    "id": "overpromise",
    "count": 1,
    "points": 4,
    "words": [
     {
      "word": "guaranteed",
      "count": 1
     }
    ]
   },
   {
    "id": "cta",
    "count": 1,
    "points": 2,
    "words": [
     {
      "word": "click here",
      "count": 1
     }
    ]
   }
  ],
  "findings": [
   {
    "severity": "fail",
    "message": "27 spam-trigger words across 7 categories (most in \"Shady / scammy\"). They aren't automatically bad, but this density reads promotional. Rewrite the flagged terms in plain, specific language."
   },
   {
    "severity": "fail",
    "message": "A URL shortener (bit.ly, tinyurl, etc.) is present. Shortened links hide the destination and are a strong spam signal. Link to your real domain instead."
   },
   {
    "severity": "warn",
    "message": "3 links. Cold emails with more than 1–2 links get filtered more often. Keep it to one, or none on the first touch."
   },
   {
    "severity": "fail",
    "message": "4 ALL-CAPS words. Caps read as shouting to both people and filters. Use normal sentence case."
   },
   {
    "severity": "fail",
    "message": "Repeated exclamation marks (!!) are a classic spam signal. Use none in a B2B email."
   },
   {
    "severity": "fail",
    "message": "Repeated currency symbols ($$$) are a textbook spam pattern. Remove them."
   },
   {
    "severity": "pass",
    "message": "50 words, a good length for a cold email."
   },
   {
    "severity": "warn",
    "message": "Exclamation mark in the subject line is a classic spam signal. Remove it."
   },
   {
    "severity": "warn",
    "message": "Emoji in the subject line skews promotional for cold B2B outreach."
   }
  ],
  "stats": {
   "words": 50,
   "characters": 331,
   "readingSeconds": 15,
   "links": 3,
   "capsWords": 4,
   "exclamations": 10,
   "emojis": 1
  }
 },
 {
  "name": "overlaps-and-free",
  "score": 38,
  "rating": "Needs work",
  "totalTriggerHits": 17,
  "scoreBreakdown": [
   {
    "label": "Spam-trigger words",
    "points": 32
   },
   {
    "label": "Fake \"Re:\" / \"Fwd:\" subject",
    "points": 6
   }
  ],
  "categoryHits": [
   {
    "id": "urgency",
    "count": 3,
    "points": 9,
    "words": [
     {
      "word": "expires today",
      "count": 1
     },
     {
      "word": "offer expires",
      "count": 1
     },
     {
      "word": "expires",
      "count": 1
     }
    ]
   },
   {
    "id": "salesy",
    "count": 9,
    "points": 9,
    "words": [
     {
      "word": "free",
      "count": 2
     },
     {
      "word": "offer",
      "count": 2
     },
     {
      "word": "100% free",
      "count": 1
     },
     {
      "word": "free trial",
      "count": 1
     },
     {
      "word": "free consultation",
      "count": 1
     },
     {
      "word": "special offer",
      "count": 1
     },
     {
      "word": "exclusive offer",
      "count": 1
     }
    ]
   },
   {
    "id": "overpromise",
    "count": 2,
    "points": 8,
    "words": [
     {
      "word": "guaranteed",
      "count": 1
     },
     {
      "word": "satisfaction guaranteed",
      "count": 1
     }
    ]
   },
   {
    "id": "cta",
    "count": 3,
    "points": 6,
    "words": [
     {
      "word": "click below",
      "count": 1
     },
     {
      "word": "sign up now",
      "count": 1
     },
     {
      "word": "get started now",
      "count": 1
     }
    ]
   }
  ],
  "findings": [
   {
    "severity": "fail",
    "message": "17 spam-trigger words across 4 categories (most in \"Urgency / pressure\"). They aren't automatically bad, but this density reads promotional. Rewrite the flagged terms in plain, specific language."
   },
   {
    "severity": "pass",
    "message": "0 links, within a safe range for cold outreach."
   },
   {
    "severity": "pass",
    "message": "27 words, a good length for a cold email."
   },
   {
    "severity": "fail",
    "message": "A fake \"Re:\" or \"Fwd:\" prefix on a first-touch email is deceptive. Recipients and filters both penalize it."
   }
  ],
  "stats": {
   "words": 27,
   "characters": 159,
   "readingSeconds": 8,
   "links": 0,
   "capsWords": 0,
   "exclamations": 0,
   "emojis": 0
  }
 },
 {
  "name": "too-short-with-link",
  "score": 5,
  "rating": "Excellent",
  "totalTriggerHits": 0,
  "scoreBreakdown": [
   {
    "label": "Too short",
    "points": 5
   }
  ],
  "categoryHits": [],
  "findings": [
   {
    "severity": "pass",
    "message": "No spam-trigger words detected."
   },
   {
    "severity": "pass",
    "message": "1 link, within a safe range for cold outreach."
   },
   {
    "severity": "warn",
    "message": "Only 3 words. Extremely short emails with a link can look like spam. Add a sentence of genuine context."
   }
  ],
  "stats": {
   "words": 3,
   "characters": 31,
   "readingSeconds": 1,
   "links": 1,
   "capsWords": 0,
   "exclamations": 0,
   "emojis": 0
  }
 },
 {
  "name": "too-long-caps-links",
  "score": 45,
  "rating": "Needs work",
  "totalTriggerHits": 0,
  "scoreBreakdown": [
   {
    "label": "Too many links",
    "points": 20
   },
   {
    "label": "ALL-CAPS words",
    "points": 15
   },
   {
    "label": "Too long",
    "points": 6
   },
   {
    "label": "Subject too long",
    "points": 4
   }
  ],
  "categoryHits": [],
  "findings": [
   {
    "severity": "pass",
    "message": "No spam-trigger words detected."
   },
   {
    "severity": "fail",
    "message": "5 links. Cold emails with more than 1–2 links get filtered more often. Keep it to one, or none on the first touch."
   },
   {
    "severity": "fail",
    "message": "80 ALL-CAPS words. Caps read as shouting to both people and filters. Use normal sentence case."
   },
   {
    "severity": "warn",
    "message": "685 words. Cold emails over ~150 words get fewer replies. Tighten it."
   },
   {
    "severity": "warn",
    "message": "Subject is 104 characters. It'll be truncated on mobile. Aim for under 50."
   }
  ],
  "stats": {
   "words": 685,
   "characters": 4189,
   "readingSeconds": 206,
   "links": 5,
   "capsWords": 80,
   "exclamations": 0,
   "emojis": 0
  }
 },
 {
  "name": "double-money",
  "score": 26,
  "rating": "Good",
  "totalTriggerHits": 7,
  "scoreBreakdown": [
   {
    "label": "Spam-trigger words",
    "points": 26
   }
  ],
  "categoryHits": [
   {
    "id": "money",
    "count": 4,
    "points": 12,
    "words": [
     {
      "word": "double your income",
      "count": 1
     },
     {
      "word": "financial freedom",
      "count": 1
     },
     {
      "word": "mortgage",
      "count": 1
     },
     {
      "word": "mortgage rates",
      "count": 1
     }
    ]
   },
   {
    "id": "overpromise",
    "count": 2,
    "points": 8,
    "words": [
     {
      "word": "double your",
      "count": 2
     }
    ]
   },
   {
    "id": "shady",
    "count": 1,
    "points": 6,
    "words": [
     {
      "word": "double your money",
      "count": 1
     }
    ]
   }
  ],
  "findings": [
   {
    "severity": "fail",
    "message": "7 spam-trigger words across 3 categories (most in \"Money / financial\"). They aren't automatically bad, but this density reads promotional. Rewrite the flagged terms in plain, specific language."
   },
   {
    "severity": "pass",
    "message": "0 links, within a safe range for cold outreach."
   },
   {
    "severity": "pass",
    "message": "29 words, a good length for a cold email."
   }
  ],
  "stats": {
   "words": 29,
   "characters": 161,
   "readingSeconds": 9,
   "links": 0,
   "capsWords": 0,
   "exclamations": 0,
   "emojis": 0
  }
 }
];

for (const g of GOLDEN) {
  test("golden: " + g.name, () => {
    const inp = INPUTS.find((i) => i.name === g.name);
    const r = checkSpamContent(inp.subject, inp.body);
    assert.equal(r.score, g.score);
    assert.equal(r.rating, g.rating);
    assert.equal(r.totalTriggerHits, g.totalTriggerHits);
    assert.deepEqual(r.scoreBreakdown, g.scoreBreakdown);
    assert.deepEqual(
      r.categoryHits.map((h) => ({ id: h.id, count: h.count, points: h.points, words: h.words })),
      g.categoryHits
    );
    assert.deepEqual(r.stats, g.stats);
    assert.deepEqual(r.findings, g.findings);
  });
}

test("site sample key numbers", () => {
  const g = GOLDEN[0];
  assert.equal(g.score, 10);
  assert.equal(g.stats.words, 76);
  assert.equal(g.stats.characters, 397);
});

test("data: 355 unique terms in 9 categories with expected weights", () => {
  assert.equal(SPAM_CATEGORIES.length, 9);
  assert.equal(DATA.termCount, 355);
  assert.equal(COMPILED.length, 355);
  assert.deepEqual(
    SPAM_CATEGORIES.map((c) => [c.id, c.weight]),
    [["shady", 6], ["pharma", 5], ["gambling", 5], ["overpromise", 4], ["money", 3], ["urgency", 3], ["greetings", 3], ["cta", 2], ["salesy", 1]]
  );
});

test("flags carry positions into subject + newline + body and do not change score", () => {
  for (const i of INPUTS) {
    const full = i.subject + "\n" + i.body;
    const a = analyze(i.subject, i.body);
    assert.equal(a.score, checkSpamContent(i.subject, i.body).score);
    assert.equal(a.flags.length, a.totalTriggerHits);
    for (const f of a.flags) {
      assert.equal(full.slice(f.index, f.index + f.matched.length), f.matched);
      assert.ok(f.suggestedRewrite.length > 0);
    }
  }
});

test("rewrite fallback is generic", () => {
  assert.match(suggestRewrite("some unknown term"), /plain, specific language/);
});

test("splitSubject handles Subject: line with blank line", () => {
  assert.deepEqual(splitSubject("Subject: Hi\n\nBody here"), { subject: "Hi", body: "Body here" });
  assert.deepEqual(splitSubject("No subject here"), { subject: "", body: "No subject here" });
});
