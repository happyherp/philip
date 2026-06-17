// Wires the DOM to the conversation state, renderer, and SSE client.
import { addMessage, appendToken, createState, toHistory } from "./frontend/state.js";
import { renderMessageInto } from "./frontend/render.js";
import { streamChat } from "./frontend/chat-client.js";
import { detectLang, getStrings } from "./i18n.js";

let lang = detectLang();
let t = getStrings(lang);

const state = createState();

const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");

// --- Voice input ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (micBtn && !SpeechRecognition) {
  micBtn.title = t.mic_no_support;
  micBtn.disabled = true;
} else if (micBtn) {
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = lang;

  let isRecording = false;
  let interimStart = 0; // tracks where interim text begins in the textarea

  micBtn.title = t.mic_start;

  micBtn.addEventListener("click", () => {
    if (isRecording) {
      recognition.stop();
    } else {
      interimStart = input.value.length;
      // Add a space separator if there's existing text
      if (interimStart > 0 && !input.value.endsWith(" ")) {
        input.value += " ";
        interimStart = input.value.length;
      }
      recognition.start();
    }
  });

  recognition.addEventListener("start", () => {
    isRecording = true;
    micBtn.classList.add("recording");
    micBtn.title = t.mic_stop;
  });

  recognition.addEventListener("result", (e) => {
    const transcript = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join("");
    // Replace everything from interimStart onward with the latest transcript
    input.value = input.value.slice(0, interimStart) + transcript;
    // Auto-grow textarea
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  });

  recognition.addEventListener("end", () => {
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.title = t.mic_start;
    input.focus();
  });

  recognition.addEventListener("error", (e) => {
    console.warn("[philip] speech recognition error:", e.error);
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.title = t.mic_start;
  });
}

// Apply i18n to static UI elements.
function applyI18n() {
  document.title = t.title;
  document.documentElement.lang = lang;
  document.querySelector(".tagline").textContent = t.tagline;
  input.placeholder = t.placeholder;
  sendBtn.textContent = t.send;
  document.getElementById("new-chat").textContent = t.new_chat;
  const shareEl = document.getElementById("share-chat");
  if (shareEl) shareEl.textContent = t.share;
}
applyI18n();

/** Switch the UI language if the model starts speaking a different language. */
function switchLang(newLang) {
  if (newLang === lang) return;
  lang = newLang;
  t = getStrings(lang);
  applyI18n();
}

// Update the static welcome message if the language differs from the default English.
if (lang !== "en") {
  const welcomeBody = document.querySelector("#log .msg-assistant .msg-body");
  if (welcomeBody) {
    welcomeBody.innerHTML =
      `<p>${t.welcome_greeting}</p>` +
      `<p>${t.welcome_body} <em>${t.welcome_keyword}</em> ${t.welcome_body_end}</p>`;
  }
}

// The conversation lives in this browser only. We persist it to localStorage so
// it survives reloads; nothing is stored on the server unless the reader uses
// "share".
const STORAGE_KEY = "philip:conversation";

function saveConversation() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages: state.messages, lang }),
    );
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

/** Append a message bubble and return its content element. */
function addBubble(role, markdown) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg-${role}`;
  const body = document.createElement("div");
  body.className = "msg-body";
  renderMessageInto(body, markdown, { lang });
  wrap.appendChild(body);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return body;
}

/** Render a list of stored messages into the log, keeping the static welcome bubble. */
function renderMessages(messages) {
  const welcomeEl = log.firstElementChild?.cloneNode(true) ?? null;
  log.innerHTML = "";
  if (welcomeEl) log.appendChild(welcomeEl);
  for (const m of messages) {
    addMessage(state, m.role, m.content);
    addBubble(m.role, m.content);
  }
  log.scrollTop = log.scrollHeight;
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

async function send(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage(state, "user", trimmed);
  addBubble("user", trimmed);
  input.value = "";
  setBusy(true);

  // Send the conversation up to and including this user turn (the assistant
  // reply is streamed back into the placeholder we add next).
  const outgoing = toHistory(state);

  const assistant = addMessage(state, "assistant", "");
  const bubble = addBubble("assistant", "");
  bubble.classList.add("thinking");

  let failure = null;
  await streamChat({
    messages: outgoing,
    lang,
    onLang: (newLang) => switchLang(newLang),
    onToken: (token) => {
      bubble.classList.remove("thinking");
      appendToken(state, token);
      renderMessageInto(bubble, assistant.content, { lang });
      log.scrollTop = log.scrollHeight;
    },
    onError: (message, info) => {
      failure = { message, code: info?.code };
    },
  });

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
  }

  // Persist the conversation to this browser.
  saveConversation();
  setBusy(false);
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  input.disabled = busy;
  if (micBtn) micBtn.disabled = busy;
  if (!busy) input.focus();
}

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

const newBtn = document.getElementById("new-chat");
if (newBtn) {
  newBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // Forget the browser-stored conversation, then reload to a clean slate.
    clearStoredConversation();
    const url = new URL(location.href);
    url.searchParams.delete("c");
    location.href = url.toString();
  });
}

// --- Share: explicit, opt-in server snapshot ---
// Conversations are browser-only; "share" is the one action that copies the
// current conversation to the server, returning a short, expiring link.
const shareBtn = document.getElementById("share-chat");
if (shareBtn) {
  shareBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const messages = toHistory(state);
    if (messages.length === 0) {
      flashShare(t.share_empty);
      return;
    }
    shareBtn.disabled = true;
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
      shareBtn.disabled = false;
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

input.focus();
