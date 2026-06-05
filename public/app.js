// Wires the DOM to the conversation state, renderer, and SSE client.
import { addMessage, appendToken, createState } from "./frontend/state.js";
import { renderMarkdownInto } from "./frontend/render.js";
import { streamChat } from "./frontend/chat-client.js";
import { detectLang, getStrings } from "./i18n.js";

const lang = detectLang();
const t = getStrings(lang);

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
document.title = t.title;
document.documentElement.lang = lang;
document.querySelector(".tagline").textContent = t.tagline;
input.placeholder = t.placeholder;
sendBtn.textContent = t.send;
document.getElementById("new-chat").textContent = t.new_chat;

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
  renderMarkdownInto(body, markdown);
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

  await streamChat({
    conversationId: conversationId || undefined,
    message: trimmed,
    lang,
    cfTurnstileToken: !conversationId ? turnstileToken || undefined : undefined,
    onConversationId: (id) => {
      if (!conversationId) {
        conversationId = id;
        const url = new URL(location.href);
        url.searchParams.set("c", id);
        history.replaceState(null, "", url.toString());
      }
    },
    onToken: (token) => {
      bubble.classList.remove("thinking");
      appendToken(state, token);
      renderMarkdownInto(bubble, assistant.content);
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
  if (micBtn && SpeechRecognition) micBtn.disabled = busy;
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

// --- Cloudflare Turnstile ---
// The widget calls window.onTurnstileToken when the user passes the challenge.
// Tokens are single-use; we reset the widget after each chat round.
// If Turnstile fails to load (CSP, localhost, missing key) the UI unlocks
// after a short timeout so the app remains usable.
let turnstileToken = null;
let turnstileActive = false;
const turnstileWidgetEl = document.getElementById("turnstile-widget");

// Disable send until Turnstile verifies — or until the timeout fires.
setBusy(true);
const turnstileTimeout = setTimeout(() => {
  if (!turnstileActive) {
    // Turnstile never completed — unlock the UI and hide the widget.
    if (turnstileWidgetEl) turnstileWidgetEl.style.display = "none";
    setBusy(false);
  }
}, 5000);

window.onTurnstileToken = (token) => {
  turnstileActive = true;
  turnstileToken = token;
  clearTimeout(turnstileTimeout);
  setBusy(false);
  // Hide the widget 2 seconds after verification.
  setTimeout(() => {
    if (turnstileWidgetEl) turnstileWidgetEl.style.display = "none";
  }, 2000);
};

// Called by Turnstile on explicit failure (bad sitekey, CSP block, etc.)
window.onTurnstileError = () => {
  if (turnstileWidgetEl) turnstileWidgetEl.style.display = "none";
  clearTimeout(turnstileTimeout);
  setBusy(false);
};

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
