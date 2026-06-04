// Wires the DOM to the conversation state, renderer, and SSE client.
import { addMessage, appendToken, createState, toHistory } from "./frontend/state.js";
import { renderMarkdownInto } from "./frontend/render.js";
import { streamChat } from "./frontend/chat-client.js";

const state = createState();

const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");

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
    // Everything up to and including the user turn (drop the empty assistant).
    messages: toHistory(state).slice(0, -1),
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

input.focus();
