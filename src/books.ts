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
  { name: "Genesis", file: "genesis", aliases: ["gen", "gn", "génesis", "genesis", "1. mose", "1 mose", "1mose", "1mo"] },
  { name: "Exodus", file: "exodus", aliases: ["ex", "exod", "éxodo", "exodo", "2. mose", "2 mose", "2mose", "2mo"] },
  { name: "Leviticus", file: "leviticus", aliases: ["lev", "lv", "levítico", "levitico", "3. mose", "3 mose", "3mose", "3mo"] },
  { name: "Numbers", file: "numbers", aliases: ["num", "nm", "nb", "números", "numeros", "nm", "núm", "4. mose", "4 mose", "4mose", "4mo"] },
  { name: "Deuteronomy", file: "deuteronomy", aliases: ["deut", "dt", "deuteronomio", "5. mose", "5 mose", "5mose", "5mo"] },
  { name: "Joshua", file: "joshua", aliases: ["josh", "jos", "josué", "josue", "josua"] },
  { name: "Judges", file: "judges", aliases: ["judg", "jdg", "jueces", "jue", "richter", "ri"] },
  { name: "Ruth", file: "ruth", aliases: ["rth", "ru", "rut"] },
  { name: "1 Samuel", file: "1samuel", aliases: ["1 sam", "1sam", "i samuel", "first samuel", "1 s", "1s"] },
  { name: "2 Samuel", file: "2samuel", aliases: ["2 sam", "2sam", "ii samuel", "second samuel", "2 s", "2s"] },
  { name: "1 Kings", file: "1kings", aliases: ["1 kgs", "1kgs", "i kings", "first kings", "1 r", "1r", "1 reyes", "1reyes", "1. könige", "1 könige", "1könige", "1kön"] },
  { name: "2 Kings", file: "2kings", aliases: ["2 kgs", "2kgs", "ii kings", "second kings", "2 r", "2r", "2 reyes", "2reyes", "2. könige", "2 könige", "2könige", "2kön"] },
  { name: "1 Chronicles", file: "1chronicles", aliases: ["1 chron", "1chr", "i chronicles", "first chronicles", "1 cr", "1cr", "1 crónicas", "1 cronicas", "1. chronik", "1 chronik", "1chronik"] },
  { name: "2 Chronicles", file: "2chronicles", aliases: ["2 chron", "2chr", "ii chronicles", "second chronicles", "2 cr", "2cr", "2 crónicas", "2 cronicas", "2. chronik", "2 chronik", "2chronik"] },
  { name: "Ezra", file: "ezra", aliases: ["ezr", "esdras", "esd", "esra", "esr"] },
  { name: "Nehemiah", file: "nehemiah", aliases: ["neh", "nehemías", "nehemias", "nehemia"] },
  { name: "Esther", file: "esther", aliases: ["est", "esth", "ester"] },
  { name: "Job", file: "job", aliases: ["jb", "hiob", "hi"] },
  { name: "Psalms", file: "psalms", aliases: ["psalm", "ps", "psa", "pss", "salmos", "sal", "psalmen"] },
  { name: "Proverbs", file: "proverbs", aliases: ["prov", "prv", "pr", "proverbios", "sprüche", "spr"] },
  { name: "Ecclesiastes", file: "ecclesiastes", aliases: ["eccl", "eccles", "qoh", "eclesiastés", "eclesiastes", "ec", "ecl", "prediger", "pred", "koh", "kohelet"] },
  { name: "Song of Solomon", file: "songofsolomon", aliases: ["song", "song of songs", "sos", "canticles", "cant", "cantares", "cnt", "ct", "cantar de los cantares", "hohelied", "hld", "hl"] },
  { name: "Isaiah", file: "isaiah", aliases: ["isa", "is", "isaías", "isaias", "jesaja", "jes"] },
  { name: "Jeremiah", file: "jeremiah", aliases: ["jer", "jr", "jeremías", "jeremias", "jeremia"] },
  { name: "Lamentations", file: "lamentations", aliases: ["lam", "lamentaciones", "klagelieder", "klag", "klgl"] },
  { name: "Ezekiel", file: "ezekiel", aliases: ["ezek", "ezk", "ezequiel", "ez", "ezeq", "hesekiel", "hes", "ezechiel"] },
  { name: "Daniel", file: "daniel", aliases: ["dan", "dn"] },
  { name: "Hosea", file: "hosea", aliases: ["hos", "oseas", "os"] },
  { name: "Joel", file: "joel", aliases: ["jl"] },
  { name: "Amos", file: "amos", aliases: ["am", "amós", "amos"] },
  { name: "Obadiah", file: "obadiah", aliases: ["obad", "ob", "abdías", "abdias", "abd", "obadja"] },
  { name: "Jonah", file: "jonah", aliases: ["jon", "jnh", "jonás", "jonas", "jona"] },
  { name: "Micah", file: "micah", aliases: ["mic", "mc", "miqueas", "mi", "miq", "micha"] },
  { name: "Nahum", file: "nahum", aliases: ["nah", "na", "nahúm", "nahum"] },
  { name: "Habakkuk", file: "habakkuk", aliases: ["hab", "hb", "habacuc", "habakuk"] },
  { name: "Zephaniah", file: "zephaniah", aliases: ["zeph", "zep", "sofonías", "sofonias", "sof", "zephanja", "zefanja"] },
  { name: "Haggai", file: "haggai", aliases: ["hag", "hg", "hageo", "haggai"] },
  { name: "Zechariah", file: "zechariah", aliases: ["zech", "zec", "zacarías", "zacarias", "zac", "sacharja", "sach"] },
  { name: "Malachi", file: "malachi", aliases: ["mal", "malaquías", "malaquias", "maleachi"] },
  { name: "Matthew", file: "matthew", aliases: ["matt", "mt", "mateo", "mat", "matthäus", "matth"] },
  { name: "Mark", file: "mark", aliases: ["mk", "mrk", "marcos", "mr", "markus"] },
  { name: "Luke", file: "luke", aliases: ["lk", "luk", "lucas", "lc", "luc", "lukas"] },
  { name: "John", file: "john", aliases: ["jn", "jhn", "juan", "jua", "johannes", "joh"] },
  { name: "Acts", file: "acts", aliases: ["act", "hechos", "hch", "apostelgeschichte", "apg"] },
  { name: "Romans", file: "romans", aliases: ["rom", "rm", "romanos", "römer", "röm"] },
  { name: "1 Corinthians", file: "1corinthians", aliases: ["1 cor", "1cor", "i corinthians", "first corinthians", "1 co", "1co", "1. korinther", "1 korinther", "1korinther", "1kor"] },
  { name: "2 Corinthians", file: "2corinthians", aliases: ["2 cor", "2cor", "ii corinthians", "second corinthians", "2 co", "2co", "2. korinther", "2 korinther", "2korinther", "2kor"] },
  { name: "Galatians", file: "galatians", aliases: ["gal", "gálatas", "galatas", "galater"] },
  { name: "Ephesians", file: "ephesians", aliases: ["eph", "ef", "efs", "efesios", "epheser"] },
  { name: "Philippians", file: "philippians", aliases: ["phil", "php", "filipenses", "fil", "flp", "philipper"] },
  { name: "Colossians", file: "colossians", aliases: ["col", "colosenses", "kolosser", "kol"] },
  { name: "1 Thessalonians", file: "1thessalonians", aliases: ["1 thess", "1thess", "i thessalonians", "first thessalonians", "1 tes", "1ts", "1. thessalonicher", "1 thessalonicher", "1thess"] },
  { name: "2 Thessalonians", file: "2thessalonians", aliases: ["2 thess", "2thess", "ii thessalonians", "second thessalonians", "2 tes", "2ts", "2. thessalonicher", "2 thessalonicher", "2thess"] },
  { name: "1 Timothy", file: "1timothy", aliases: ["1 tim", "1tim", "i timothy", "first timothy", "1 ti", "1. timotheus", "1 timotheus", "1timotheus"] },
  { name: "2 Timothy", file: "2timothy", aliases: ["2 tim", "2tim", "ii timothy", "second timothy", "2 ti", "2. timotheus", "2 timotheus", "2timotheus"] },
  { name: "Titus", file: "titus", aliases: ["tit"] },
  { name: "Philemon", file: "philemon", aliases: ["philem", "phm", "filemón", "filemon", "flm", "philemon", "phlm"] },
  { name: "Hebrews", file: "hebrews", aliases: ["heb", "hebreos", "hebräer", "hebr"] },
  { name: "James", file: "james", aliases: ["jas", "jm", "santiago", "stg", "sant", "jakobus", "jak"] },
  { name: "1 Peter", file: "1peter", aliases: ["1 pet", "1pet", "i peter", "first peter", "1 pe", "1 pd", "1. petrus", "1 petrus", "1petrus", "1petr"] },
  { name: "2 Peter", file: "2peter", aliases: ["2 pet", "2pet", "ii peter", "second peter", "2 pe", "2 pd", "2. petrus", "2 petrus", "2petrus", "2petr"] },
  { name: "1 John", file: "1john", aliases: ["1 jn", "1jn", "i john", "first john", "1 juan", "1jua", "1. johannes", "1 johannes", "1johannes", "1joh"] },
  { name: "2 John", file: "2john", aliases: ["2 jn", "2jn", "ii john", "second john", "2 juan", "2jua", "2. johannes", "2 johannes", "2johannes", "2joh"] },
  { name: "3 John", file: "3john", aliases: ["3 jn", "3jn", "iii john", "third john", "3 juan", "3jua", "3. johannes", "3 johannes", "3johannes", "3joh"] },
  { name: "Jude", file: "jude", aliases: ["jud", "jd", "judas", "jds", "judasbrief"] },
  { name: "Revelation", file: "revelation", aliases: ["rev", "rv", "apocalypse", "apocalipsis", "ap", "apoc", "offenbarung", "offb", "off", "apk"] },
];

/** Books before Matthew (index 39) are the Old Testament. */
const OT_BOOK_COUNT = 39;

export function isOldTestament(book: BookMeta): boolean {
  return BOOKS.indexOf(book) < OT_BOOK_COUNT;
}

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
