// UI translations for supported languages.
// Add new languages here; keys must match what detectLang() returns.

export const I18N = {
  en: {
    title: "Philip — read the Bible together",
    tagline: "“Do you understand what you are reading?” — Acts 8:30",
    welcome_name: "Philip",
    welcome_greeting: "Hi — I’m Philip.",
    welcome_body: "Let’s read the Bible together, a few verses at a time. Tell me where to start, bring a question that’s been on your mind, or just say",
    welcome_keyword: "start",
    welcome_body_end: "and I’ll pick a place.",
    placeholder: "Type a verse, a question, or “start”…",
    send: "Send",
    new_chat: "new",
    error_prefix: "Something went wrong: ",
  },
  es: {
    title: "Felipe — leer la Biblia juntos",
    tagline: "“¿Entiendes lo que lees?” — Hechos 8:30",
    welcome_name: "Felipe",
    welcome_greeting: "Hola — soy Felipe.",
    welcome_body: "Leamos la Biblia juntos, unos pocos versículos a la vez. Díme por dónde empezar, trae una pregunta que tienes en mente, o simplemente escribe",
    welcome_keyword: "empezar",
    welcome_body_end: "y yo elijo el pasaje.",
    placeholder: "Escribe un versículo, una pregunta, o “empezar”…",
    send: "Enviar",
    new_chat: "nuevo",
    error_prefix: "Algo salió mal: ",
  },
  de: {
    title: "Philipp — die Bibel gemeinsam lesen",
    tagline: "„Verstehst du auch, was du liest?“ — Apostelgeschichte 8:30",
    welcome_name: "Philipp",
    welcome_greeting: "Hallo — ich bin Philipp.",
    welcome_body: "Lass uns gemeinsam die Bibel lesen, ein paar Verse auf einmal. Sag mir, wo wir anfangen sollen, bring eine Frage, die dich beschäftigt, oder schreib einfach",
    welcome_keyword: "anfangen",
    welcome_body_end: "und ich suche eine Stelle aus.",
    placeholder: "Schreib einen Vers, eine Frage oder „Anfangen“…",
    send: "Senden",
    new_chat: "neu",
    error_prefix: "Etwas ist schiefgelaufen: ",
  },
};

export function detectLang() {
  const raw = (navigator.language || "en").toLowerCase();
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("de")) return "de";
  return "en";
}

export function getStrings(lang) {
  return I18N[lang] || I18N.en;
}
