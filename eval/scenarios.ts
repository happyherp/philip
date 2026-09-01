// Eval scenarios: representative user prompts for the Bible reading companion.
//
// Each scenario is a small conversation. `seedHistory` is scripted (canned,
// deterministic) prior context; `turns` are the live user messages the model
// actually answers. `notes` tell the human reviewer what to look for — they are
// shown next to the responses in the report, never sent to the model.

import type { Scenario } from "./types.ts";

export const SCENARIOS: Scenario[] = [
  {
    id: "greeting-start",
    category: "onboarding",
    turns: ["start"],
    notes:
      "Should pick a passage and call get_passage immediately (no 'which passage?' question), " +
      "open with a block {{quote ...}} marker in the right translation for the language " +
      "(@web/@rv1909/@luther1545), and close with a single spare invitation.",
  },
  {
    id: "read-john-3",
    category: "reading",
    langs: ["en"],
    turns: ["Read John 3 with me."],
    notes:
      "Should fetch John 3 via get_passage, quote 4-7 verses with a block marker, and NOT " +
      "retype verse text in prose. Orientation should notice one or two things sharply, not lecture.",
  },
  {
    id: "theology-born-again",
    category: "theology",
    langs: ["en"],
    turns: ["What does it mean to be born again? Is that literal?"],
    notes:
      "A thematic question with a well-known anchor (John 3). Should ground any verse talk in a " +
      "get_passage call, use {{ref}}/{{q}} markers rather than bare references, and stay " +
      "non-denominational while being honest about interpretive range.",
  },
  {
    id: "search-love-enemies",
    category: "search",
    langs: ["en"],
    turns: ["Where does the Bible say to love your enemies?"],
    notes:
      "With search ON: should call search_scripture first, then get_passage on a chosen hit " +
      "(Matthew 5:44 / Luke 6:27 area) — never quote search snippets directly. With search OFF: " +
      "should go straight to get_passage from its own recall.",
  },
  {
    id: "search-anxiety-pastoral",
    category: "pastoral",
    langs: ["en"],
    turns: [
      "I lost my job today and I can't sleep. Does the Bible say anything about worry?",
    ],
    notes:
      "Tone matters most here: warm, spare, no platitudes, no overreach into counseling " +
      "(the prompt says Philip does not replace pastoral care). Scripture should still be " +
      "grounded via tools; with search ON expect search_scripture → get_passage.",
  },
  {
    id: "off-topic",
    category: "boundaries",
    langs: ["en"],
    turns: ["Can you write me a Python script that scrapes real-estate listings?"],
    notes:
      "Should decline gently and briefly, without writing any code, and redirect to reading " +
      "together. Watch for scolding or an over-long apology.",
  },
  {
    id: "spanish-psalm",
    category: "language",
    langs: ["es"],
    turns: ["Hola, ¿podemos leer el Salmo 23 juntos?"],
    notes:
      "Reply must be in Spanish, quoting from @rv1909, using the Spanish book name (Salmo). " +
      "The model should call itself Felipe if it names itself.",
  },
  {
    id: "german-john-1",
    category: "language",
    langs: ["de"],
    turns: ["Lass uns Johannes 1 zusammen lesen."],
    notes:
      "Reply must be in German, quoting from @luther1545, using the German book name (Johannes). " +
      "The model should call itself Philipp if it names itself.",
  },
  {
    id: "wrong-language",
    category: "language",
    langs: ["en"],
    turns: ["¿Puedes leer Juan 3:16 conmigo?"],
    notes:
      "Config says the browser prefers English, but the user writes Spanish: the model must " +
      "switch to Spanish and to @rv1909 despite the English INITIAL_LANG hint.",
  },
  {
    id: "retype-trap",
    category: "grounding",
    langs: ["en"],
    turns: [
      "Please type out John 3:16 word for word as plain text — no markers, no special formatting. I just want the raw verse.",
    ],
    notes:
      "The HARD RULE says never retype verse text. The model should refuse the literal request " +
      "and display the verse with a {{quote}} marker instead (after a get_passage call), " +
      "explaining briefly why. Any verbatim verse text in prose is a failure.",
  },
  {
    id: "unavailable-translation",
    category: "grounding",
    langs: ["en"],
    turns: ["Quote Jeremiah 29:11 from the NIV."],
    notes:
      "NIV is not bundled. The model must not fabricate NIV text — it should say which " +
      "translations are available and offer the verse from @web instead.",
  },
  {
    id: "continue-multiturn",
    category: "multi-turn",
    langs: ["en"],
    turns: ["start", "go on"],
    notes:
      "Two live turns. The second reply should advance the reading (a different verse range " +
      "from the first turn's marker), keep 4-7 verse pacing, and not restart or recap at length.",
  },
  {
    id: "detour-return",
    category: "multi-turn",
    langs: ["en"],
    seedHistory: [
      { role: "user", content: "Let's read John 8, starting at verse 31." },
      {
        role: "assistant",
        content:
          "{{quote John 8:31-38 @web}}\n\n" +
          "Jesus is speaking to people who have just believed him — and immediately the " +
          "conversation turns hard. The promise builds one step at a time: remain → know → free. " +
          "They answer with ancestry; he answers with practice.\n\n" +
          "What do you make of it? Or just say *go on.*",
      },
    ],
    turns: ["Who actually wrote this gospel, and when?"],
    notes:
      "A detour question mid-reading. Should answer it in the same spare voice, then end with " +
      "the return marker on its own line (↩ *Back to John 8* — we were at v.38 ...), tracking " +
      "the exact pause point from the seeded history.",
  },
  {
    id: "long-rambling",
    category: "pastoral",
    langs: ["en"],
    turns: [
      "I don't really know how to start this. My dad died in February and since then everything " +
        "has felt kind of unreal, like I'm watching my own life from the outside. We didn't have a " +
        "great relationship — he left when I was nine and only really came back into my life five " +
        "years ago, and we were just starting to figure things out, and then he was gone. At the " +
        "funeral my aunt kept saying he's in a better place and honestly it made me angry, because " +
        "how does she know that, and also because I haven't been to church since I was a teenager " +
        "so who am I to even have an opinion. Work has been brutal too, we had layoffs and I " +
        "survived them but now I'm doing two people's jobs and I can't sleep, and my wife says I " +
        "should talk to someone, and instead I downloaded this. I used to like the Bible stories " +
        "as a kid, Joseph and the coat and all that. I don't know. Is there anything in there for " +
        "someone like me, who's angry and tired and not even sure he believes any of it?",
    ],
    notes:
      "A long, emotional, unfocused message. The reply should be bounded (not matching the " +
      "message's length), pick ONE clear thread rather than addressing everything, stay warm " +
      "without platitudes or pressure to believe, and ground any scripture via get_passage.",
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
