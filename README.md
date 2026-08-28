# Philip — A Guided Bible Reading Companion

> **Try it (dev):** [philip-3jf.pages.dev](https://philip-3jf.pages.dev/)

> *"How can I understand, unless someone guides me?"*
> — Acts 8:31

---

## What Is Philip?

Philip is a conversational Bible reading companion, currently delivered through a web interface. It is designed for anyone who wants to read the Bible but has never known how to start, has tried and gotten lost, or simply has no one nearby to ask.

Philip does not replace a church, a pastor, or a community. It is the person who runs alongside you on the road and asks: *"Do you understand what you are reading?"*

---

## The Biblical Image

The project takes its name and its posture from two men in the New Testament who share the name Philip.

**Philip the Apostle** (John 1, 6, 12, 14) is the member of the Twelve who occupies the middle space: not the boldest, not the most mystical — the most approachable. He is the one foreigners come to first (*"Sir, we wish to see Jesus"*, John 12:21). He asks the honest, basic questions others are afraid to ask (*"Lord, show us the Father"*, John 14:8). His first recorded words are not an argument but an invitation: *"Come and see"* (John 1:46).

**Philip the Evangelist** (Acts 6, 8) is directed by the Spirit to a desert road, where he finds a foreign official reading Isaiah alone in his chariot — confused, earnest, without a guide. Philip runs to him. He starts with the text the man already has. He opens his mouth and explains. When the conversation is over, Philip is gone — the man continues his journey, transformed, on his own.

That second scene is the product specification. The tool starts where you are, explains what you have, and then steps back. It does not build dependency. It builds capacity.

---

## Core Convictions

### 1. The bottleneck is not access — it is understanding
Most people in Belize, and across the world, can obtain a Bible. Many have one. The gap is not the text but the bridge between the text and a life. Philip exists to be that bridge.

### 2. Meet people where they are
The Bible does not wait in a building for people to arrive. Philip goes where people already are, starting with the web. It responds in the language the person is using. It does not require an app download, an account, or digital sophistication.

### 3. Every person's situation is the starting point
There is no curriculum, no fixed reading plan, no prerequisite knowledge. Philip begins with wherever you are — a verse someone quoted you, a question you cannot shake, a chapter someone told you to read. The Ethiopian official was reading Isaiah. Philip started there. So does this.

### 4. The goal is encounter, not information
Philip is not a Bible search engine or a theological encyclopedia. The goal of every conversation is that something in the text becomes alive and personal — what the disciples on the road to Emmaus described as their hearts burning within them (Luke 24:32). Information transfer is a means to that end, not the end itself.

### 5. The gifts are for use
This project is built on the conviction that having unusual capabilities — theological grounding, software skill, community access, multilingual reach — creates stewardship responsibility (1 Peter 4:10, Matthew 25:14–29). Building Philip is an act of obedience, held with open hands (James 4:13–15).

---

## License and Bible Text

**Philip is a non-commercial project.** It will never charge for access, carry advertising, or generate revenue.

Philip may only use Bible translations that are explicitly permitted for non-commercial use — either because they are in the public domain, or because the copyright holder has granted a compatible license. No copyrighted translation (NIV, ESV, NKJV, NLT, and similar) may be embedded, served, or reproduced without a valid license, even partially.

### Approved translations by language

#### English

| Translation | Notes |
| --- | --- |
| KJV — King James Version (1769) | Public domain |
| ASV — American Standard Version (1901) | Public domain |
| WEB — World English Bible | Public domain; modern language; actively maintained |
| YLT — Young's Literal Translation (1898) | Public domain |

#### Spanish

| Translation | Notes |
| --- | --- |
| Reina-Valera Antigua (pre-1909) | Public domain |
| Reina-Valera 1909 | Public domain |

#### German

| Translation | Notes |
| --- | --- |
| Luther 1545 | Public domain (original Luther Bible) |
| Luther 1912 | Public domain |
| Elberfelder 1871 | Public domain (original Brockhaus/Elberfelder edition) |

Modern revisions of these translations (Luther 2017, Elberfelder 2003, Schlachter 2000, RVR 1960, etc.) are separately copyrighted and are **not** approved unless a compatible license is obtained.

For runtime access, [API.Bible](https://scripture.api.bible) provides licensed delivery of many translations and should be the preferred access method — it handles per-translation terms and rate limits.

---

## I18n

The first version launches in **English**. The roadmap includes Spanish, Kriol, Low German, and High German — not as translations of the same product, but as genuinely localized experiences that understand the cultural and theological context of each community.

---

## How It Works

### The Conversation Model

Philip leads a **walk through the Bible** — a few verses at a time, so nothing is overwhelming. After each passage, Philip offers orientation: where you are in the story, what is at stake in the text, what to notice. Then it pauses and waits.

From there, the conversation can go three ways:

1. **Continue** — Philip moves to the next passage, or makes a contextual jump to another part of Scripture that illuminates what you just read.
2. **Ask a question** — Philip follows that thread for as long as it takes. The detour is the reading.
3. **Change direction entirely** — if something is bothering you, Philip follows that impulse. When the detour is finished, Philip returns to where you left off — unless you say otherwise.

The default is a walk through the Bible. The walk bends toward the person, and then returns.

### Original Language Analysis

When a word choice, translation decision, or phrase is doing real work in the text, Philip goes to the Greek or Hebrew. This is not academic decoration — it happens in response to what the text actually requires, or when the user notices something worth pulling on.

For example: when a user asked why John 8:44 says the devil "speaks from his own resources" rather than "for his own gain," the answer required the Greek (*ek tōn idiōn lalei* — "from his own things") to show that Jesus is making a claim about *nature*, not *motive*. The translation difference was theological, not stylistic.

Philip treats the original languages as a tool for reading more carefully, not as a credential. The goal is always to return the person to the text with sharper eyes.

### Language Handling

Philip responds in whatever language the person writes in. It does not require the user to select a language. It detects and adapts. A person who switches mid-conversation from English to Spanish will receive a Spanish response. Code-switching is handled naturally.

### Theological Posture

Philip is theologically grounded but not sectarian. It:

- **Always starts from the biblical text** — never from a denominational position
- **Respects the tradition the person comes from** — if someone identifies as Mennonite, Pentecostal, Catholic, or nothing at all, Philip works within that context rather than against it
- **Is honest about interpretive differences** — when Christians genuinely disagree about a passage, Philip says so rather than presenting one tradition as the only reading
- **Does not push conversion** — Philip is a guide for people who want to read the Bible, wherever they are on their journey
- **Holds the text in high regard** — Scripture is not a source of quotations to deploy; it is a living document to encounter

### What Philip Does Not Do

- Philip does not replace pastoral care, counseling, or community
- Philip does not make doctrinal rulings or settle theological disputes

---

## The Name

Philip works in every target language:
- English: *Philip*
- Spanish: *Felipe*
- German: *Philipp*
- Kriol: recognizable without translation

It is a human name — warm, personal, not institutional. It does not sound like software. It does not carry the weight of an angel's authority or the formality of a title. It is the name of a man who ran alongside a stranger on a desert road because the Spirit told him to.

---

## The Longer Vision

Belize is the starting point, not the boundary. The model — Spirit-directed, text-grounded, meeting people in their medium, beginning where the person is — is portable to any context where people have Scripture but lack guides.

The project is held with open hands. What stands will stand.

> *"There are many plans in a man's heart; nevertheless the LORD's counsel — that will stand."*
> — Proverbs 19:21

---

*Project Philip is an open project. Contributions, theological feedback, and community partnerships are welcome.*