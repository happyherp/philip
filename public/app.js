// Wires the DOM to the conversation state, renderer, and SSE client.
import { addMessage, appendToken, createState, insertRead, toHistory } from "./frontend/state.js";
import { renderMessageInto } from "./frontend/render.js";
import { streamChat } from "./frontend/chat-client.js";
import { summarizeConversation } from "./frontend/summary-client.js";
import {
  addRecord,
  makeRecord,
  removeRecord,
  renameRecord,
  sanitizeList,
} from "./frontend/conversations.js";
import { detectLang, getStrings } from "./i18n.js";
import { setupAbout, applyAboutI18n } from "./frontend/about.js";

let lang = detectLang();
let t = getStrings(lang);

const state = createState();

const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const newBtn = document.getElementById("new-chat");
const shareBtn = document.getElementById("share-chat");
const convNav = document.getElementById("conversations");
const convListEl = document.getElementById("conversation-list");
const convTitleEl = document.getElementById("conversations-title");
const convToggleBtn = document.getElementById("toggle-conversations");
const themeBtn = document.getElementById("theme-toggle");

// Past conversations saved in this browser (newest first).
let conversations = [];

// Apply i18n to static UI elements.
function applyI18n() {
  document.title = t.title;
  document.documentElement.lang = lang;
  document.querySelector(".tagline").textContent = t.tagline;
  input.placeholder = t.placeholder;
  sendBtn.textContent = t.send;
  if (newBtn) newBtn.textContent = t.new_chat;
  if (shareBtn) shareBtn.textContent = t.share;
  if (convToggleBtn) {
    convToggleBtn.textContent = t.conversations_toggle;
    convToggleBtn.title = t.conversations_title;
  }
  if (convTitleEl) convTitleEl.textContent = t.conversations_title;
  applyAboutI18n(t, lang);
  updateThemeToggle();
  renderConversationList();
  updateShareState();
}

// --- Theme (light / dark) -----------------------------------------------
// The initial theme is resolved before first paint by the inline script in
// index.html (saved choice → OS preference → time of day) and applied via the
// data-theme attribute on <html>. Here we only handle the manual toggle and
// keep the chip's icon/label in sync.
const THEME_KEY = "philip:theme";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function updateThemeToggle() {
  if (!themeBtn) return;
  const dark = currentTheme() === "dark";
  // Show the icon for the theme you'd switch *to*, and label the action.
  themeBtn.textContent = dark ? "☀" : "☾";
  const label = dark ? t.theme_to_light : t.theme_to_dark;
  themeBtn.title = label;
  themeBtn.setAttribute("aria-label", label);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage may be unavailable (private mode) */
  }
  updateThemeToggle();
}

if (themeBtn) {
  themeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  });
}

/** Switch the UI language if the model starts speaking a different language. */
function switchLang(newLang) {
  if (newLang === lang) return;
  lang = newLang;
  t = getStrings(lang);
  applyI18n();
}

// Update the static welcome message if the language differs from the default English.
function applyWelcomeLang() {
  if (lang === "en") return;
  const welcomeBody = document.querySelector("#log .msg-assistant .msg-body");
  if (welcomeBody) {
    welcomeBody.innerHTML =
      `<p>${t.welcome_greeting}</p>` +
      `<p>${t.welcome_body} <em>${t.welcome_keyword}</em> ${t.welcome_body_end}</p>`;
  }
}

// The conversation lives in this browser only. We persist it to localStorage so
// it survives reloads; nothing is stored on the server unless the reader uses
// "share". Past conversations the reader has moved on from are kept in a
// separate, browser-only list.
const STORAGE_KEY = "philip:conversation";
const CONVERSATIONS_KEY = "philip:conversations";

function saveConversation() {
  try {
    const data = { messages: state.messages, lang };
    if (state.condensedSummary) {
      data.condensedSummary = state.condensedSummary;
      data.condensedUpToIndex = state.condensedUpToIndex;
    }
    if (state.lastRequestAt) data.lastRequestAt = state.lastRequestAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[philip] could not save conversation", e);
  }
}

function clearStoredConversation() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

// A blank spacer kept as the log's last child. During streaming it is grown to
// a full viewport so the latest turn can be scrolled to the top of the screen
// (the reply then fills the empty space below instead of pushing text upward).
let spacer = null;
function ensureSpacer() {
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.className = "log-spacer";
    spacer.setAttribute("aria-hidden", "true");
  }
  if (spacer.parentNode !== log) log.appendChild(spacer);
  return spacer;
}

function loadConversations() {
  try {
    conversations = sanitizeList(
      JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || "null"),
    );
  } catch {
    conversations = [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn("[philip] could not save conversation list", e);
  }
}

/** Append a message bubble and return its wrapper and content elements. */
function addBubble(role, markdown) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg-${role}`;
  const body = document.createElement("div");
  body.className = "msg-body";
  renderMessageInto(body, markdown, { lang });
  wrap.appendChild(body);
  // Keep new bubbles above the trailing spacer.
  log.insertBefore(wrap, ensureSpacer());
  log.scrollTop = log.scrollHeight;
  return { wrap, body };
}

/**
 * Set the text of a read note, e.g. "Reading John 3 in WEB" while a fetch is in
 * flight, or "Read John 3 in WEB" once it's done. The `reading` flag adds the
 * pulsing-dots indicator (shared `.thinking` style).
 */
function setReadText(el, reference, translation, reading) {
  el.classList.toggle("thinking", reading);
  el.textContent = (reading ? t.reading : t.read)
    .replace("{reference}", reference)
    .replace("{translation}", translation);
}

/** Build a read-note line element (not yet attached to the log). */
function makeReadEl(reference, translation, reading) {
  const el = document.createElement("div");
  el.className = "read-note";
  setReadText(el, reference, translation, reading);
  return el;
}

/** Append a finalized ("Read …") note to the log, above the trailing spacer. */
function addReadBubble(reference, translation) {
  const el = makeReadEl(reference, translation, false);
  log.insertBefore(el, ensureSpacer());
  return el;
}

/** Render a list of stored messages into the log, keeping the static welcome bubble. */
function renderMessages(messages) {
  const welcomeEl = log.firstElementChild?.cloneNode(true) ?? null;
  log.innerHTML = "";
  if (welcomeEl) log.appendChild(welcomeEl);
  state.messages = [];
  for (const m of messages) {
    if (m.role === "read") {
      state.messages.push({ role: "read", reference: m.reference, translation: m.translation });
      addReadBubble(m.reference, m.translation);
    } else {
      addMessage(state, m.role, m.content);
      addBubble(m.role, m.content);
    }
  }
  log.scrollTop = log.scrollHeight;
  updateShareState();
}

/** Restore this browser's working conversation from localStorage. */
function restoreConversation() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return;
  }
  if (!stored || !Array.isArray(stored.messages) || stored.messages.length === 0) {
    return;
  }
  if (typeof stored.lang === "string") switchLang(stored.lang);
  renderMessages(stored.messages);
  if (typeof stored.condensedSummary === "string") {
    state.condensedSummary = stored.condensedSummary;
    state.condensedUpToIndex = stored.condensedUpToIndex ?? 0;
  }
  if (typeof stored.lastRequestAt === "number") {
    state.lastRequestAt = stored.lastRequestAt;
  }
}

/**
 * Open a shared conversation snapshot from a ?c=... link. The snapshot is a
 * frozen server copy; we fork it into this browser's local conversation so
 * continuing it stays browser-only and never mutates the shared copy.
 */
async function loadSharedConversation(id) {
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(id)}`);
    if (!res.ok) {
      console.warn("[philip] could not load shared conversation", id, res.status);
      return false;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.messages)) return false;
    if (typeof data.lang === "string") switchLang(data.lang);
    renderMessages(data.messages);
    saveConversation();
    return true;
  } catch (e) {
    console.error("[philip] loadSharedConversation failed", e);
    return false;
  }
}

// --- Boot ---
setupAbout();
loadConversations();
applyI18n();
applyWelcomeLang();

// On load: a ?c=... link opens a shared snapshot (forked into local storage);
// otherwise restore this browser's own conversation. Either way we drop the
// ?c= param so a later reload resumes the local copy, not the snapshot.
const urlId = new URLSearchParams(location.search).get("c");
if (urlId) {
  loadSharedConversation(urlId).finally(() => {
    const url = new URL(location.href);
    url.searchParams.delete("c");
    history.replaceState(null, "", url.toString());
  });
} else {
  restoreConversation();
}

renderConversationList();
updateShareState();

async function send(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage(state, "user", trimmed);
  const { wrap: userWrap } = addBubble("user", trimmed);
  input.value = "";
  autoGrow();
  setBusy(true);

  // Send the conversation up to and including this user turn (the assistant
  // reply is streamed back into the placeholder we add next).
  const outgoing = toHistory(state);

  // The assistant turn is added to state lazily, on the first token, so any
  // "read" notes recorded during tool calls are ordered before the answer.
  let assistant = null;
  const { wrap: assistantWrap, body: bubble } = addBubble("assistant", "");
  bubble.classList.add("thinking");

  // Anchor this turn near the top of the log and reserve a screen of empty
  // space below, so the streaming reply grows downward into that space instead
  // of pushing the text the reader is looking at upward. We do not auto-scroll
  // again during the stream — the reading position stays put.
  ensureSpacer().style.height = `${log.clientHeight}px`;
  userWrap.scrollIntoView({ block: "start" });

  // Re-render at most once per animation frame: many tokens can arrive within
  // a single frame, and re-parsing the whole markdown each time causes flicker.
  let frame = 0;
  const flush = () => {
    frame = 0;
    renderMessageInto(bubble, assistant.content, { lang });
  };
  const scheduleRender = () => {
    if (!frame) frame = requestAnimationFrame(flush);
  };

  // The verse fetch in progress, shown as a "Reading …" line above the answer.
  // When the next read starts (or the answer begins) it becomes a persisted
  // "Read …" note that stays in the conversation history.
  let pendingRead = null;
  const finalizeRead = () => {
    if (!pendingRead) return;
    const { el, reference, translation } = pendingRead;
    setReadText(el, reference, translation, false);
    insertRead(state, reference, translation, assistant);
    pendingRead = null;
  };

  let failure = null;
  await streamChat({
    messages: outgoing,
    lang,
    lastRequestAt: state.lastRequestAt || undefined,
    condensedSummary: state.condensedSummary || undefined,
    onLang: (newLang) => switchLang(newLang),
    onToken: (token) => {
      finalizeRead();
      if (!assistant) assistant = addMessage(state, "assistant", "");
      bubble.classList.remove("thinking");
      appendToken(state, token);
      scheduleRender();
    },
    onStatus: (status) => {
      if (status?.type !== "reading") return;
      // A new read starting means the previous one (if any) is complete.
      finalizeRead();
      const reference = status.reference ?? "";
      const translation = status.translation ?? "";
      const el = makeReadEl(reference, translation, true);
      log.insertBefore(el, assistantWrap);
      pendingRead = { el, reference, translation };
      // The read line now carries the activity indicator instead of the bubble.
      bubble.classList.remove("thinking");
    },
    onCondensed: ({ summary, upToIndex }) => {
      state.condensedSummary = summary;
      // upToIndex is relative to what was sent (outgoing), but the messages
      // array may include "read" notes. Map it to the full state.messages index
      // by counting only user/assistant messages.
      let count = 0;
      let fullIndex = 0;
      for (let i = 0; i < state.messages.length; i++) {
        const m = state.messages[i];
        if (m.role === "user" || m.role === "assistant") count++;
        if (count >= upToIndex) { fullIndex = i + 1; break; }
      }
      state.condensedUpToIndex = fullIndex;
    },
    onError: (message, info) => {
      failure = { message, code: info?.code };
    },
  });

  state.lastRequestAt = Date.now();

  // The stream is done: settle any in-flight read, drop any pending frame and
  // render the final content once, then release the reserved space.
  finalizeRead();
  if (frame) cancelAnimationFrame(frame);
  renderMessageInto(bubble, assistant ? assistant.content : "", { lang });
  ensureSpacer().style.height = "";

  if (failure) {
    console.error("[philip]", failure.message);
    // Drop the empty/partial assistant turn so it isn't persisted or resent.
    if (state.messages[state.messages.length - 1]?.role === "assistant") {
      state.messages.pop();
    }
    bubble.classList.remove("thinking");
    bubble.innerHTML = "";
    const err = document.createElement("div");
    err.className = "error";
    err.textContent = `${t.error_prefix}${failure.message}`;
    bubble.appendChild(err);
  } else if (!assistant) {
    // Philip read passages but produced no answer text — drop the empty bubble.
    assistantWrap.remove();
  }

  // Persist the conversation to this browser.
  saveConversation();
  setBusy(false);
  // The reader has now had a reply — sharing becomes available.
  updateShareState();
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  input.disabled = busy;
  if (!busy) input.focus();
}

/**
 * Resize the textarea to fit its content: shrinks back to one row when empty
 * and grows line-by-line as the reader types. The CSS max-height caps it at
 * five lines, after which it scrolls.
 */
function autoGrow() {
  input.style.height = "auto";
  const height = input.scrollHeight;
  input.style.height = height + "px";
  // Once the input spills past a single line, stack the Send button so
  // it takes less width and the textarea gets more room.
  const cs = getComputedStyle(input);
  const oneLine =
    parseFloat(cs.lineHeight) +
    parseFloat(cs.paddingTop) +
    parseFloat(cs.paddingBottom);
  form.classList.toggle("multiline", height > oneLine + 1);
}

input.addEventListener("input", autoGrow);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  send(input.value);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// --- Saved conversations -------------------------------------------------

/**
 * Whether the active conversation is worth saving / sharing: it must have a
 * reader turn and a non-empty reply from Philip.
 */
function hasReply() {
  const hasUser = state.messages.some(
    (m) => m.role === "user" && m.content.trim(),
  );
  const hasAssistant = state.messages.some(
    (m) => m.role === "assistant" && m.content.trim(),
  );
  return hasUser && hasAssistant;
}

/**
 * Move the active conversation into the saved list, labelling it with an
 * LLM-generated title + verse-referencing summary (falling back to the first
 * user turn when the summariser is unavailable). No-op for empty conversations.
 */
async function archiveActive() {
  if (!hasReply()) return;
  const messages = toHistory(state);
  const recordLang = lang;
  const { title, summary } = await summarizeConversation({ messages, lang });
  const record = makeRecord({ messages, lang: recordLang, title, summary });
  conversations = addRecord(conversations, record);
  saveConversations();
  renderConversationList();
}

/** Reset the active conversation to a clean slate (welcome bubble only). */
function resetActive() {
  clearStoredConversation();
  renderMessages([]);
  state.condensedSummary = null;
  state.condensedUpToIndex = 0;
  state.lastRequestAt = 0;
  input.focus();
}

/** Show or hide the dropdown panel. */
function setConversationsOpen(open) {
  if (!convNav || !convToggleBtn) return;
  // The list is reachable only via its chip, which is itself hidden when empty.
  const canOpen = open && conversations.length > 0;
  convNav.hidden = !canOpen;
  convToggleBtn.setAttribute("aria-expanded", String(canOpen));
}

function renderConversationList() {
  if (!convListEl || !convNav) return;
  convListEl.innerHTML = "";
  if (conversations.length === 0) {
    // Keep the start page thin: the chip (and panel) only appear once there's
    // something saved.
    if (convToggleBtn) convToggleBtn.hidden = true;
    setConversationsOpen(false);
    return;
  }
  if (convToggleBtn) convToggleBtn.hidden = false;
  for (const c of conversations) {
    const li = document.createElement("li");
    li.className = "conversation-item";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "conversation-open";
    const titleEl = document.createElement("span");
    titleEl.className = "conversation-name";
    titleEl.textContent = c.title || t.conversation_untitled;
    open.appendChild(titleEl);
    if (c.summary) {
      const sumEl = document.createElement("span");
      sumEl.className = "conversation-summary";
      sumEl.textContent = c.summary;
      open.appendChild(sumEl);
    }
    open.addEventListener("click", () => openConversation(c.id));

    const actions = document.createElement("div");
    actions.className = "conversation-actions";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "conversation-action";
    renameBtn.textContent = t.rename;
    renameBtn.addEventListener("click", () => renameConversation(c.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "conversation-action";
    deleteBtn.textContent = t.delete;
    deleteBtn.addEventListener("click", () => deleteConversation(c.id));

    actions.append(renameBtn, deleteBtn);
    li.append(open, actions);
    convListEl.appendChild(li);
  }
}

/** Load a saved conversation into the active view, archiving the current one. */
async function openConversation(id) {
  const target = conversations.find((c) => c.id === id);
  if (!target) return;
  await archiveActive();
  conversations = removeRecord(conversations, id);
  saveConversations();
  if (typeof target.lang === "string") switchLang(target.lang);
  renderMessages(target.messages);
  saveConversation();
  renderConversationList();
  setConversationsOpen(false);
  log.scrollTop = 0;
}

function renameConversation(id) {
  const current = conversations.find((c) => c.id === id);
  const next = window.prompt(t.rename_prompt, current?.title || "");
  if (next == null) return;
  conversations = renameRecord(conversations, id, next);
  saveConversations();
  renderConversationList();
}

function deleteConversation(id) {
  if (!window.confirm(t.delete_confirm)) return;
  conversations = removeRecord(conversations, id);
  saveConversations();
  renderConversationList();
}

if (newBtn) {
  newBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (newBtn.dataset.busy === "1") return;
    const wasActive = hasReply();
    if (wasActive) {
      newBtn.dataset.busy = "1";
      newBtn.textContent = t.saving;
      try {
        await archiveActive();
      } finally {
        newBtn.dataset.busy = "";
        newBtn.textContent = t.new_chat;
      }
    }
    resetActive();
    const url = new URL(location.href);
    url.searchParams.delete("c");
    history.replaceState(null, "", url.toString());
  });
}

// Toggle the saved-conversations dropdown.
if (convToggleBtn) {
  convToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setConversationsOpen(convNav.hidden);
  });
}

// Dismiss the dropdown on Escape or a click/tap outside it.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && convNav && !convNav.hidden) setConversationsOpen(false);
});
document.addEventListener("pointerdown", (e) => {
  if (!convNav || convNav.hidden) return;
  const target = e.target;
  if (convNav.contains(target) || convToggleBtn?.contains(target)) return;
  setConversationsOpen(false);
});

// --- Share: explicit, opt-in server snapshot ---
// Conversations are browser-only; "share" is the one action that copies the
// current conversation to the server, returning a short, expiring link. It only
// becomes available once the reader has had a first reply from Philip.
function updateShareState() {
  if (!shareBtn) return;
  const ready = hasReply();
  shareBtn.classList.toggle("disabled", !ready);
  shareBtn.setAttribute("aria-disabled", String(!ready));
  shareBtn.title = ready ? t.share : t.share_disabled;
}

if (shareBtn) {
  shareBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (shareBtn.classList.contains("disabled")) return;
    const messages = toHistory(state);
    if (messages.length === 0) {
      flashShare(t.share_empty);
      return;
    }
    shareBtn.classList.add("disabled");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, lang }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        flashShare((data && data.error) || t.share_failed);
        return;
      }
      let copied = false;
      try {
        await navigator.clipboard.writeText(data.url);
        copied = true;
      } catch {
        /* clipboard may be blocked; fall back to showing the link */
      }
      flashShare(copied ? t.share_copied : data.url);
    } catch (err) {
      console.error("[philip] share failed", err);
      flashShare(t.share_failed);
    } finally {
      updateShareState();
    }
  });
}

/** Briefly show a status message in place of the share label. */
let shareFlashTimer = null;
function flashShare(text) {
  if (!shareBtn) return;
  clearTimeout(shareFlashTimer);
  shareBtn.textContent = text;
  shareFlashTimer = setTimeout(() => {
    shareBtn.textContent = t.share;
  }, 4000);
}

// --- Mobile: auto-hide the header while reading -------------------------
// The log is the scroll container, so we watch its scroll direction: scrolling
// down past the header slides it up out of view, and any upward scroll brings it
// straight back. On mobile the header overlays the log (see styles.css), so this
// toggle never reflows the reading content. The styling is gated to phone widths
// in CSS, so this is effectively inert on wider screens.
(function setupHeaderAutoHide() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  // Publish the header's height so the CSS knows how far to slide it up.
  const measure = () => {
    document.documentElement.style.setProperty(
      "--topbar-h",
      `${topbar.offsetHeight}px`,
    );
  };
  measure();
  window.addEventListener("resize", measure);

  let lastTop = log.scrollTop;
  let ticking = false;

  const update = () => {
    ticking = false;
    const top = log.scrollTop;
    const delta = top - lastTop;
    // Ignore tiny jitters and rubber-band overscroll.
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && top > topbar.offsetHeight) {
      // Reading on, past the header: tuck it away.
      document.body.classList.add("header-hidden");
    } else if (delta < 0) {
      // Any scroll back up reveals it again.
      document.body.classList.remove("header-hidden");
    }
    lastTop = top;
  };

  log.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
})();

input.focus();
