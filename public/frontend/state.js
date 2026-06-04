// Pure conversation state — no DOM, no network. Easy to unit test.

/** @typedef {{ role: "user" | "assistant", content: string }} Message */

/** Create an empty conversation. */
export function createState() {
  return { messages: /** @type {Message[]} */ ([]) };
}

/** Append a message and return the created message object. */
export function addMessage(state, role, content = "") {
  const msg = { role, content };
  state.messages.push(msg);
  return msg;
}

/** Append a streamed token to the most recent message. */
export function appendToken(state, token) {
  const last = state.messages[state.messages.length - 1];
  if (!last) throw new Error("appendToken called with no messages");
  last.content += token;
  return last;
}

/** The history to send to the server (already just role/content). */
export function toHistory(state) {
  return state.messages.map((m) => ({ role: m.role, content: m.content }));
}
