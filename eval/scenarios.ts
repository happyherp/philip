/**
 * Test scenarios for the Philip model comparison.
 *
 * Each scenario is a sequence of messages simulating a real conversation
 * start, designed to surface differences in tone, warmth, pacing, and
 * theological sensitivity across models and prompt variants.
 */

export interface Scenario {
  key: string;
  description: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export const scenarios: Scenario[] = [
  // 1. Cold start — the most common first message. Tests whether the model
  //    picks a passage on its own (as instructed) vs. asks back, and what
  //    tone it strikes on the very first turn.
  {
    key: "cold-start",
    description:
      "User opens the app for the first time and just says 'start'. " +
      "Tests opening warmth, passage selection, and invitation style.",
    messages: [{ role: "user", content: "start" }],
  },

  // 2. Genuine question mid-reading — tests the detour mechanic and whether
  //    the model answers in the spare, rhythmic voice or shifts into lecture mode.
  {
    key: "honest-question",
    description:
      "User asks a vulnerable, real question about a difficult verse. " +
      "Tests empathy, theological care, and whether the model stays spare.",
    messages: [
      { role: "user", content: "Let's read John 8:31-36" },
      // We simulate the assistant having already responded; the user now asks:
      {
        role: "assistant",
        content:
          '*John 8:31–36*\n\n> Jesus therefore said to those Jews who had believed him, "If you remain in my word, then you are truly my disciples. You will know the truth, and the truth will make you free." They answered him, "We are Abraham\'s seed, and have never been in bondage to anyone. How do you say, \'You will be made free\'?" Jesus answered them, "Most certainly I tell you, everyone who commits sin is the bondservant of sin. A bondservant doesn\'t live in the house forever. A son remains forever. If therefore the Son makes you free, you will be free indeed."\n\n— WEB\n\nJesus is drawing a line between two kinds of belonging.',
      },
      {
        role: "user",
        content:
          "This is hard for me. I grew up being told I was free in Christ but I still feel trapped. What does this passage actually mean by freedom?",
      },
    ],
  },

  // 3. Cross-reference follow-up — tests whether the model connects passages
  //    gracefully and keeps the spare voice while doing real theology.
  {
    key: "cross-reference",
    description:
      "User asks the model to connect two passages. " +
      "Tests theological depth without losing conversational warmth.",
    messages: [
      {
        role: "user",
        content:
          "I read Genesis 1:1-3 yesterday. Today someone quoted John 1:1 to me and said they are connected. Can you show me both and explain?",
      },
    ],
  },

  // 4. End-of-chapter transition — tests whether the model handles the
  //    chapter boundary correctly (open question, no "go on" offered).
  {
    key: "chapter-end",
    description:
      "User reaches the last verses of a short chapter (Philemon 23-25). " +
      "Tests chapter-end behavior: open question, no 'go on' prompt.",
    messages: [{ role: "user", content: "Let's read Philemon 23-25" }],
  },

  // 5. Emotional / pastoral moment — tests whether the model stays human,
  //    warm, and brief rather than lecturing or being clinical.
  {
    key: "pastoral",
    description:
      "User shares something personal and emotional. " +
      "Tests pastoral sensitivity, brevity, and whether the model resists offering unsolicited advice.",
    messages: [
      { role: "user", content: "Read Psalm 23 with me" },
      {
        role: "assistant",
        content:
          '*Psalm 23*\n\n> Yahweh is my shepherd; I shall lack nothing. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul. He guides me in the paths of righteousness for his name\'s sake. Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me. You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over. Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh\'s house forever.\n\n— WEB\n\nThis is a song sung by someone who has been through the valley — not around it.',
      },
      {
        role: "user",
        content:
          "My mother just died last week. She used to read this psalm to me when I was little. I don't even know why I'm here.",
      },
    ],
  },
];
