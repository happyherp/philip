// Canonical 66-book list for the World English Bible (WEB).
// `file` matches the TehShrike/world-english-bible naming (lowercased, no spaces).
// `aliases` are extra spellings/abbreviations the reference parser should accept.

export interface BookMeta {
  /** Human-readable canonical name, e.g. "1 Samuel". */
  name: string;
  /** Source/bundled file stem, e.g. "1samuel" -> public/bible/web/1samuel.json. */
  file: string;
  /** Extra accepted spellings (lowercased). The name and file are added automatically. */
  aliases?: string[];
}

export const BOOKS: BookMeta[] = [
  { name: "Genesis", file: "genesis", aliases: ["gen", "gn"] },
  { name: "Exodus", file: "exodus", aliases: ["ex", "exod"] },
  { name: "Leviticus", file: "leviticus", aliases: ["lev", "lv"] },
  { name: "Numbers", file: "numbers", aliases: ["num", "nm", "nb"] },
  { name: "Deuteronomy", file: "deuteronomy", aliases: ["deut", "dt"] },
  { name: "Joshua", file: "joshua", aliases: ["josh", "jos"] },
  { name: "Judges", file: "judges", aliases: ["judg", "jdg"] },
  { name: "Ruth", file: "ruth", aliases: ["rth", "ru"] },
  { name: "1 Samuel", file: "1samuel", aliases: ["1 sam", "1sam", "i samuel", "first samuel"] },
  { name: "2 Samuel", file: "2samuel", aliases: ["2 sam", "2sam", "ii samuel", "second samuel"] },
  { name: "1 Kings", file: "1kings", aliases: ["1 kgs", "1kgs", "i kings", "first kings"] },
  { name: "2 Kings", file: "2kings", aliases: ["2 kgs", "2kgs", "ii kings", "second kings"] },
  { name: "1 Chronicles", file: "1chronicles", aliases: ["1 chron", "1chr", "i chronicles", "first chronicles"] },
  { name: "2 Chronicles", file: "2chronicles", aliases: ["2 chron", "2chr", "ii chronicles", "second chronicles"] },
  { name: "Ezra", file: "ezra", aliases: ["ezr"] },
  { name: "Nehemiah", file: "nehemiah", aliases: ["neh"] },
  { name: "Esther", file: "esther", aliases: ["est", "esth"] },
  { name: "Job", file: "job", aliases: ["jb"] },
  { name: "Psalms", file: "psalms", aliases: ["psalm", "ps", "psa", "pss"] },
  { name: "Proverbs", file: "proverbs", aliases: ["prov", "prv", "pr"] },
  { name: "Ecclesiastes", file: "ecclesiastes", aliases: ["eccl", "eccles", "qoh"] },
  { name: "Song of Solomon", file: "songofsolomon", aliases: ["song", "song of songs", "sos", "canticles", "cant"] },
  { name: "Isaiah", file: "isaiah", aliases: ["isa", "is"] },
  { name: "Jeremiah", file: "jeremiah", aliases: ["jer", "jr"] },
  { name: "Lamentations", file: "lamentations", aliases: ["lam"] },
  { name: "Ezekiel", file: "ezekiel", aliases: ["ezek", "ezk"] },
  { name: "Daniel", file: "daniel", aliases: ["dan", "dn"] },
  { name: "Hosea", file: "hosea", aliases: ["hos"] },
  { name: "Joel", file: "joel", aliases: ["jl"] },
  { name: "Amos", file: "amos", aliases: ["am"] },
  { name: "Obadiah", file: "obadiah", aliases: ["obad", "ob"] },
  { name: "Jonah", file: "jonah", aliases: ["jon", "jnh"] },
  { name: "Micah", file: "micah", aliases: ["mic", "mc"] },
  { name: "Nahum", file: "nahum", aliases: ["nah", "na"] },
  { name: "Habakkuk", file: "habakkuk", aliases: ["hab", "hb"] },
  { name: "Zephaniah", file: "zephaniah", aliases: ["zeph", "zep"] },
  { name: "Haggai", file: "haggai", aliases: ["hag", "hg"] },
  { name: "Zechariah", file: "zechariah", aliases: ["zech", "zec"] },
  { name: "Malachi", file: "malachi", aliases: ["mal"] },
  { name: "Matthew", file: "matthew", aliases: ["matt", "mt"] },
  { name: "Mark", file: "mark", aliases: ["mk", "mrk"] },
  { name: "Luke", file: "luke", aliases: ["lk", "luk"] },
  { name: "John", file: "john", aliases: ["jn", "jhn"] },
  { name: "Acts", file: "acts", aliases: ["act"] },
  { name: "Romans", file: "romans", aliases: ["rom", "rm"] },
  { name: "1 Corinthians", file: "1corinthians", aliases: ["1 cor", "1cor", "i corinthians", "first corinthians"] },
  { name: "2 Corinthians", file: "2corinthians", aliases: ["2 cor", "2cor", "ii corinthians", "second corinthians"] },
  { name: "Galatians", file: "galatians", aliases: ["gal"] },
  { name: "Ephesians", file: "ephesians", aliases: ["eph"] },
  { name: "Philippians", file: "philippians", aliases: ["phil", "php"] },
  { name: "Colossians", file: "colossians", aliases: ["col"] },
  { name: "1 Thessalonians", file: "1thessalonians", aliases: ["1 thess", "1thess", "i thessalonians", "first thessalonians"] },
  { name: "2 Thessalonians", file: "2thessalonians", aliases: ["2 thess", "2thess", "ii thessalonians", "second thessalonians"] },
  { name: "1 Timothy", file: "1timothy", aliases: ["1 tim", "1tim", "i timothy", "first timothy"] },
  { name: "2 Timothy", file: "2timothy", aliases: ["2 tim", "2tim", "ii timothy", "second timothy"] },
  { name: "Titus", file: "titus", aliases: ["tit"] },
  { name: "Philemon", file: "philemon", aliases: ["philem", "phm"] },
  { name: "Hebrews", file: "hebrews", aliases: ["heb"] },
  { name: "James", file: "james", aliases: ["jas", "jm"] },
  { name: "1 Peter", file: "1peter", aliases: ["1 pet", "1pet", "i peter", "first peter"] },
  { name: "2 Peter", file: "2peter", aliases: ["2 pet", "2pet", "ii peter", "second peter"] },
  { name: "1 John", file: "1john", aliases: ["1 jn", "1jn", "i john", "first john"] },
  { name: "2 John", file: "2john", aliases: ["2 jn", "2jn", "ii john", "second john"] },
  { name: "3 John", file: "3john", aliases: ["3 jn", "3jn", "iii john", "third john"] },
  { name: "Jude", file: "jude", aliases: ["jud", "jd"] },
  { name: "Revelation", file: "revelation", aliases: ["rev", "rv", "apocalypse"] },
];

/** Normalize a book token for matching: lowercase, strip periods, collapse spaces. */
export function normalizeBookKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a lookup from every accepted spelling (spaced and unspaced) to BookMeta. */
export function buildBookIndex(): Map<string, BookMeta> {
  const index = new Map<string, BookMeta>();
  const add = (key: string, book: BookMeta) => {
    const norm = normalizeBookKey(key);
    index.set(norm, book);
    index.set(norm.replace(/ /g, ""), book); // also the space-free form, e.g. "1john"
  };
  for (const book of BOOKS) {
    add(book.name, book);
    add(book.file, book);
    for (const alias of book.aliases ?? []) add(alias, book);
  }
  return index;
}
