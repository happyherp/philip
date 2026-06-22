// Pure conversation state — no DOM, no network. Easy to unit test.

/** @typedef {{ role: "user" | "assistant", content: string }} Message */
/** @typedef {{ role: "read", reference: string, translation: string }} ReadNote A record of a passage Philip read while answering. */

/** Create an empty conversation. */
export function createState() {
  return { messages: /** @type {(Message | ReadNote)[]} */ ([]) };
}

/** Append a message and return the created message object. */
export function addMessage(state, role, content = "") {
  const msg = { role, content };
  state.messages.push(msg);
  return msg;
}

/**
 * Record that a passage was read. The note is placed immediately before
 * `anchor` (the assistant turn) so reads always precede the answer they
 * informed; with no anchor yet it goes at the end. Returns the note.
 */
export function insertRead(state, reference, translation, anchor) {
  const note = { role: "read", reference, translation };
  const i = anchor ? state.messages.indexOf(anchor) : -1;
  if (i >= 0) state.messages.splice(i, 0, note);
  else state.messages.push(note);
  return note;
}

/** Append a streamed token to the most recent message. */
export function appendToken(state, token) {
  const last = state.messages[state.messages.length - 1];
  if (!last) throw new Error("appendToken called with no messages");
  last.content += token;
  return last;
}

/** The history to send to the server: only the user/assistant turns. */
export function toHistory(state) {
  return state.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
}
