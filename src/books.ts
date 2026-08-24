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
  /**
   * Display name for a reader-language translation, keyed by translation
   * `lang` (e.g. "es", "de"). Falls back to `name` (English) when the
   * translation's language has no entry here — which is also what scholarly
   * (original-language/study) translations should always use.
   */
  names?: Record<string, string>;
}

export const BOOKS: BookMeta[] = [
  { name: "Genesis", file: "genesis", aliases: ["gen", "gn", "génesis", "genesis", "1. mose", "1 mose", "1mose", "1mo"], names: { es: "Génesis", de: "1. Mose" } },
  { name: "Exodus", file: "exodus", aliases: ["ex", "exod", "éxodo", "exodo", "2. mose", "2 mose", "2mose", "2mo"], names: { es: "Éxodo", de: "2. Mose" } },
  { name: "Leviticus", file: "leviticus", aliases: ["lev", "lv", "levítico", "levitico", "3. mose", "3 mose", "3mose", "3mo"], names: { es: "Levítico", de: "3. Mose" } },
  { name: "Numbers", file: "numbers", aliases: ["num", "nm", "nb", "números", "numeros", "nm", "núm", "4. mose", "4 mose", "4mose", "4mo"], names: { es: "Números", de: "4. Mose" } },
  { name: "Deuteronomy", file: "deuteronomy", aliases: ["deut", "dt", "deuteronomio", "5. mose", "5 mose", "5mose", "5mo"], names: { es: "Deuteronomio", de: "5. Mose" } },
  { name: "Joshua", file: "joshua", aliases: ["josh", "jos", "josué", "josue", "josua"], names: { es: "Josué", de: "Josua" } },
  { name: "Judges", file: "judges", aliases: ["judg", "jdg", "jueces", "jue", "richter", "ri"], names: { es: "Jueces", de: "Richter" } },
  { name: "Ruth", file: "ruth", aliases: ["rth", "ru", "rut"], names: { es: "Rut", de: "Rut" } },
  { name: "1 Samuel", file: "1samuel", aliases: ["1 sam", "1sam", "i samuel", "first samuel", "1 s", "1s"], names: { es: "1 Samuel", de: "1. Samuel" } },
  { name: "2 Samuel", file: "2samuel", aliases: ["2 sam", "2sam", "ii samuel", "second samuel", "2 s", "2s"], names: { es: "2 Samuel", de: "2. Samuel" } },
  { name: "1 Kings", file: "1kings", aliases: ["1 kgs", "1kgs", "i kings", "first kings", "1 r", "1r", "1 reyes", "1reyes", "1. könige", "1 könige", "1könige", "1kön"], names: { es: "1 Reyes", de: "1. Könige" } },
  { name: "2 Kings", file: "2kings", aliases: ["2 kgs", "2kgs", "ii kings", "second kings", "2 r", "2r", "2 reyes", "2reyes", "2. könige", "2 könige", "2könige", "2kön"], names: { es: "2 Reyes", de: "2. Könige" } },
  { name: "1 Chronicles", file: "1chronicles", aliases: ["1 chron", "1chr", "i chronicles", "first chronicles", "1 cr", "1cr", "1 crónicas", "1 cronicas", "1. chronik", "1 chronik", "1chronik"], names: { es: "1 Crónicas", de: "1. Chronik" } },
  { name: "2 Chronicles", file: "2chronicles", aliases: ["2 chron", "2chr", "ii chronicles", "second chronicles", "2 cr", "2cr", "2 crónicas", "2 cronicas", "2. chronik", "2 chronik", "2chronik"], names: { es: "2 Crónicas", de: "2. Chronik" } },
  { name: "Ezra", file: "ezra", aliases: ["ezr", "esdras", "esd", "esra", "esr"], names: { es: "Esdras", de: "Esra" } },
  { name: "Nehemiah", file: "nehemiah", aliases: ["neh", "nehemías", "nehemias", "nehemia"], names: { es: "Nehemías", de: "Nehemia" } },
  { name: "Esther", file: "esther", aliases: ["est", "esth", "ester"], names: { es: "Ester", de: "Ester" } },
  { name: "Job", file: "job", aliases: ["jb", "hiob", "hi"], names: { es: "Job", de: "Hiob" } },
  { name: "Psalms", file: "psalms", aliases: ["psalm", "ps", "psa", "pss", "salmos", "sal", "psalmen"], names: { es: "Salmos", de: "Psalm" } },
  { name: "Proverbs", file: "proverbs", aliases: ["prov", "prv", "pr", "proverbios", "sprüche", "spr"], names: { es: "Proverbios", de: "Sprüche" } },
  { name: "Ecclesiastes", file: "ecclesiastes", aliases: ["eccl", "eccles", "qoh", "eclesiastés", "eclesiastes", "ec", "ecl", "prediger", "pred", "koh", "kohelet"], names: { es: "Eclesiastés", de: "Prediger" } },
  { name: "Song of Solomon", file: "songofsolomon", aliases: ["song", "song of songs", "sos", "canticles", "cant", "cantares", "cnt", "ct", "cantar de los cantares", "hohelied", "hld", "hl"], names: { es: "Cantares", de: "Hohelied" } },
  { name: "Isaiah", file: "isaiah", aliases: ["isa", "is", "isaías", "isaias", "jesaja", "jes"], names: { es: "Isaías", de: "Jesaja" } },
  { name: "Jeremiah", file: "jeremiah", aliases: ["jer", "jr", "jeremías", "jeremias", "jeremia"], names: { es: "Jeremías", de: "Jeremia" } },
  { name: "Lamentations", file: "lamentations", aliases: ["lam", "lamentaciones", "klagelieder", "klag", "klgl"], names: { es: "Lamentaciones", de: "Klagelieder" } },
  { name: "Ezekiel", file: "ezekiel", aliases: ["ezek", "ezk", "ezequiel", "ez", "ezeq", "hesekiel", "hes", "ezechiel"], names: { es: "Ezequiel", de: "Hesekiel" } },
  { name: "Daniel", file: "daniel", aliases: ["dan", "dn"], names: { es: "Daniel", de: "Daniel" } },
  { name: "Hosea", file: "hosea", aliases: ["hos", "oseas", "os"], names: { es: "Oseas", de: "Hosea" } },
  { name: "Joel", file: "joel", aliases: ["jl"], names: { es: "Joel", de: "Joel" } },
  { name: "Amos", file: "amos", aliases: ["am", "amós", "amos"], names: { es: "Amós", de: "Amos" } },
  { name: "Obadiah", file: "obadiah", aliases: ["obad", "ob", "abdías", "abdias", "abd", "obadja"], names: { es: "Abdías", de: "Obadja" } },
  { name: "Jonah", file: "jonah", aliases: ["jon", "jnh", "jonás", "jonas", "jona"], names: { es: "Jonás", de: "Jona" } },
  { name: "Micah", file: "micah", aliases: ["mic", "mc", "miqueas", "mi", "miq", "micha"], names: { es: "Miqueas", de: "Micha" } },
  { name: "Nahum", file: "nahum", aliases: ["nah", "na", "nahúm", "nahum"], names: { es: "Nahúm", de: "Nahum" } },
  { name: "Habakkuk", file: "habakkuk", aliases: ["hab", "hb", "habacuc", "habakuk"], names: { es: "Habacuc", de: "Habakuk" } },
  { name: "Zephaniah", file: "zephaniah", aliases: ["zeph", "zep", "sofonías", "sofonias", "sof", "zephanja", "zefanja"], names: { es: "Sofonías", de: "Zephanja" } },
  { name: "Haggai", file: "haggai", aliases: ["hag", "hg", "hageo", "haggai"], names: { es: "Hageo", de: "Haggai" } },
  { name: "Zechariah", file: "zechariah", aliases: ["zech", "zec", "zacarías", "zacarias", "zac", "sacharja", "sach"], names: { es: "Zacarías", de: "Sacharja" } },
  { name: "Malachi", file: "malachi", aliases: ["mal", "malaquías", "malaquias", "maleachi"], names: { es: "Malaquías", de: "Maleachi" } },
  { name: "Matthew", file: "matthew", aliases: ["matt", "mt", "mateo", "mat", "matthäus", "matth"], names: { es: "Mateo", de: "Matthäus" } },
  { name: "Mark", file: "mark", aliases: ["mk", "mrk", "marcos", "mr", "markus"], names: { es: "Marcos", de: "Markus" } },
  { name: "Luke", file: "luke", aliases: ["lk", "luk", "lucas", "lc", "luc", "lukas"], names: { es: "Lucas", de: "Lukas" } },
  { name: "John", file: "john", aliases: ["jn", "jhn", "juan", "jua", "johannes", "joh"], names: { es: "Juan", de: "Johannes" } },
  { name: "Acts", file: "acts", aliases: ["act", "hechos", "hch", "apostelgeschichte", "apg"], names: { es: "Hechos", de: "Apostelgeschichte" } },
  { name: "Romans", file: "romans", aliases: ["rom", "rm", "romanos", "römer", "röm"], names: { es: "Romanos", de: "Römer" } },
  { name: "1 Corinthians", file: "1corinthians", aliases: ["1 cor", "1cor", "i corinthians", "first corinthians", "1 co", "1co", "1. korinther", "1 korinther", "1korinther", "1kor"], names: { es: "1 Corintios", de: "1. Korinther" } },
  { name: "2 Corinthians", file: "2corinthians", aliases: ["2 cor", "2cor", "ii corinthians", "second corinthians", "2 co", "2co", "2. korinther", "2 korinther", "2korinther", "2kor"], names: { es: "2 Corintios", de: "2. Korinther" } },
  { name: "Galatians", file: "galatians", aliases: ["gal", "gálatas", "galatas", "galater"], names: { es: "Gálatas", de: "Galater" } },
  { name: "Ephesians", file: "ephesians", aliases: ["eph", "ef", "efs", "efesios", "epheser"], names: { es: "Efesios", de: "Epheser" } },
  { name: "Philippians", file: "philippians", aliases: ["phil", "php", "filipenses", "fil", "flp", "philipper"], names: { es: "Filipenses", de: "Philipper" } },
  { name: "Colossians", file: "colossians", aliases: ["col", "colosenses", "kolosser", "kol"], names: { es: "Colosenses", de: "Kolosser" } },
  { name: "1 Thessalonians", file: "1thessalonians", aliases: ["1 thess", "1thess", "i thessalonians", "first thessalonians", "1 tes", "1ts", "1. thessalonicher", "1 thessalonicher", "1thess"], names: { es: "1 Tesalonicenses", de: "1. Thessalonicher" } },
  { name: "2 Thessalonians", file: "2thessalonians", aliases: ["2 thess", "2thess", "ii thessalonians", "second thessalonians", "2 tes", "2ts", "2. thessalonicher", "2 thessalonicher", "2thess"], names: { es: "2 Tesalonicenses", de: "2. Thessalonicher" } },
  { name: "1 Timothy", file: "1timothy", aliases: ["1 tim", "1tim", "i timothy", "first timothy", "1 ti", "1. timotheus", "1 timotheus", "1timotheus"], names: { es: "1 Timoteo", de: "1. Timotheus" } },
  { name: "2 Timothy", file: "2timothy", aliases: ["2 tim", "2tim", "ii timothy", "second timothy", "2 ti", "2. timotheus", "2 timotheus", "2timotheus"], names: { es: "2 Timoteo", de: "2. Timotheus" } },
  { name: "Titus", file: "titus", aliases: ["tit"], names: { es: "Tito", de: "Titus" } },
  { name: "Philemon", file: "philemon", aliases: ["philem", "phm", "filemón", "filemon", "flm", "philemon", "phlm"], names: { es: "Filemón", de: "Philemon" } },
  { name: "Hebrews", file: "hebrews", aliases: ["heb", "hebreos", "hebräer", "hebr"], names: { es: "Hebreos", de: "Hebräer" } },
  { name: "James", file: "james", aliases: ["jas", "jm", "santiago", "stg", "sant", "jakobus", "jak"], names: { es: "Santiago", de: "Jakobus" } },
  { name: "1 Peter", file: "1peter", aliases: ["1 pet", "1pet", "i peter", "first peter", "1 pe", "1 pd", "1. petrus", "1 petrus", "1petrus", "1petr"], names: { es: "1 Pedro", de: "1. Petrus" } },
  { name: "2 Peter", file: "2peter", aliases: ["2 pet", "2pet", "ii peter", "second peter", "2 pe", "2 pd", "2. petrus", "2 petrus", "2petrus", "2petr"], names: { es: "2 Pedro", de: "2. Petrus" } },
  { name: "1 John", file: "1john", aliases: ["1 jn", "1jn", "i john", "first john", "1 juan", "1jua", "1. johannes", "1 johannes", "1johannes", "1joh"], names: { es: "1 Juan", de: "1. Johannes" } },
  { name: "2 John", file: "2john", aliases: ["2 jn", "2jn", "ii john", "second john", "2 juan", "2jua", "2. johannes", "2 johannes", "2johannes", "2joh"], names: { es: "2 Juan", de: "2. Johannes" } },
  { name: "3 John", file: "3john", aliases: ["3 jn", "3jn", "iii john", "third john", "3 juan", "3jua", "3. johannes", "3 johannes", "3johannes", "3joh"], names: { es: "3 Juan", de: "3. Johannes" } },
  { name: "Jude", file: "jude", aliases: ["jud", "jd", "judas", "jds", "judasbrief"], names: { es: "Judas", de: "Judas" } },
  { name: "Revelation", file: "revelation", aliases: ["rev", "rv", "apocalypse", "apocalipsis", "ap", "apoc", "offenbarung", "offb", "off", "apk"], names: { es: "Apocalipsis", de: "Offenbarung" } },
];

/** Books before Matthew (index 39) are the Old Testament. */
const OT_BOOK_COUNT = 39;

export function isOldTestament(book: BookMeta): boolean {
  return BOOKS.indexOf(book) < OT_BOOK_COUNT;
}

/**
 * The book's display name for a translation's language, e.g. "Mateo" for
 * `lang: "es"`. Falls back to the canonical English `name` when `lang` is
 * undefined or the book has no name recorded for it — which research/
 * scholarly translations should always pass (they stay in English).
 */
export function bookNameFor(book: BookMeta, lang: string | undefined): string {
  if (!lang) return book.name;
  return book.names?.[lang] ?? book.name;
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
