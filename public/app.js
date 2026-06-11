// Wires the DOM to the conversation state, renderer, and SSE client.
import { addMessage, appendToken, createState } from "./frontend/state.js";
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

// Server-side conversation id (from URL or learned on first turn via header)
let conversationId = null;

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

/** Load a persisted conversation from the server and render it (used for ?c=... resumes). */
async function loadConversation(id) {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    if (!res.ok) {
      console.warn("[philip] could not load conversation", id, res.status);
      return;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.messages)) return;

    // Preserve the static welcome bubble before clearing, then restore it so
    // it remains visible when resuming a persisted conversation.
    const welcomeEl = log.firstElementChild?.cloneNode(true) ?? null;
    log.innerHTML = "";
    if (welcomeEl) log.appendChild(welcomeEl);

    for (const m of data.messages) {
      addMessage(state, m.role, m.content);
      addBubble(m.role, m.content);
    }
    log.scrollTop = log.scrollHeight;
  } catch (e) {
    console.error("[philip] loadConversation failed", e);
  }
}

// Resume from URL (?c=...) on initial load. The static welcome in index.html
// will be cleared by loadConversation.
const urlId = new URLSearchParams(location.search).get("c");
if (urlId) {
  conversationId = urlId;
  loadConversation(urlId);
}

async function send(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage(state, "user", trimmed);
  addBubble("user", trimmed);
  input.value = "";
  setBusy(true);

  const assistant = addMessage(state, "assistant", "");
  const bubble = addBubble("assistant", "");
  bubble.classList.add("thinking");

  // New conversations run the (usually invisible) bot check first.
  let cfToken;
  if (!conversationId) {
    await getTurnstileToken();
    cfToken = consumeTurnstileToken();
  }

  await streamChat({
    conversationId: conversationId || undefined,
    message: trimmed,
    lang,
    cfTurnstileToken: cfToken || undefined,
    onConversationId: (id) => {
      if (!conversationId) {
        conversationId = id;
        const url = new URL(location.href);
        url.searchParams.set("c", id);
        history.replaceState(null, "", url.toString());
      }
    },
    onLang: (newLang) => switchLang(newLang),
    onToken: (token) => {
      bubble.classList.remove("thinking");
      appendToken(state, token);
      renderMessageInto(bubble, assistant.content, { lang });
      log.scrollTop = log.scrollHeight;
    },
    onError: (message) => {
      console.error("[philip]", message);
      bubble.classList.remove("thinking");
      bubble.innerHTML = "";
      const err = document.createElement("div");
      err.className = "error";
      err.textContent = `${t.error_prefix}${message}`;
      bubble.appendChild(err);
    },
  });

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

// --- Cloudflare Turnstile (invisible, on-demand) ---
// The widget never blocks the UI. The challenge runs only when the first
// message of a new conversation is sent (turnstile.execute), and the widget
// becomes visible only if Cloudflare needs user interaction. If Turnstile is
// unavailable (script blocked, hostname not allowlisted), we send without a
// token and let the server decide.
let turnstileToken = null;
let turnstileUnavailable = false;
let turnstilePending = null; // { resolve, timer } while a challenge is running
const turnstileWidgetEl = document.getElementById("turnstile-widget");

function resolveTurnstilePending(value) {
  if (!turnstilePending) return;
  clearTimeout(turnstilePending.timer);
  const { resolve } = turnstilePending;
  turnstilePending = null;
  resolve(value);
}

window.onTurnstileToken = (token) => {
  turnstileToken = token;
  resolveTurnstilePending(token);
};

// Called by Turnstile on explicit failure (bad sitekey, CSP block, etc.)
window.onTurnstileError = () => {
  turnstileUnavailable = true;
  if (turnstileWidgetEl) turnstileWidgetEl.style.display = "none";
  resolveTurnstilePending(null);
};

window.onTurnstileExpired = () => {
  turnstileToken = null;
};

// The challenge turned interactive — the user may take a while, stop the clock.
window.onTurnstileInteractive = () => {
  if (turnstilePending) {
    clearTimeout(turnstilePending.timer);
    turnstilePending.timer = undefined;
  }
};

/** Run the challenge if needed and resolve with a token, or null if unavailable. */
function getTurnstileToken(timeoutMs = 15000) {
  if (turnstileToken) return Promise.resolve(turnstileToken);
  if (turnstileUnavailable || !turnstileWidgetEl || !window.turnstile) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    turnstilePending = {
      resolve,
      timer: setTimeout(() => resolveTurnstilePending(null), timeoutMs),
    };
    try {
      window.turnstile.execute(turnstileWidgetEl);
    } catch (e) {
      console.warn("[philip] turnstile.execute failed", e);
      resolveTurnstilePending(null);
    }
  });
}

/** Tokens are single-use: hand it out once and re-arm the widget for retries. */
function consumeTurnstileToken() {
  const token = turnstileToken;
  turnstileToken = null;
  try {
    window.turnstile?.reset(turnstileWidgetEl);
  } catch {
    /* widget may not be rendered (localhost, blocked script) */
  }
  return token;
}

const newBtn = document.getElementById("new-chat");
if (newBtn) {
  newBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // Clean reload drops the ?c= param so the static welcome reappears.
    const url = new URL(location.href);
    url.searchParams.delete("c");
    location.href = url.toString();
  });
}

input.focus();
