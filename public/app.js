// Wires the DOM to the conversation state, renderer, and SSE client.
import { addMessage, appendToken, createState } from "./frontend/state.js";
import { renderMarkdownInto } from "./frontend/render.js";
import { streamChat } from "./frontend/chat-client.js";

const state = createState();

const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");

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

    // Remove the static welcome message that lives in the initial HTML.
    log.innerHTML = "";

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
      err.textContent = `Something went wrong: ${message}`;
      bubble.appendChild(err);
    },
  });
  // Always unfreeze the UI when the stream ends, regardless of success/error.
  setBusy(false);
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  input.disabled = busy;
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
    // Clean reload drops the ?c= param so the static welcome reappears.
    const url = new URL(location.href);
    url.searchParams.delete("c");
    location.href = url.toString();
  });
}

input.focus();
