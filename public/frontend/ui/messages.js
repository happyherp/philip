// The conversation log: the welcome bubble, committed messages, and the
// in-progress ("active") turn while Philip streams a reply.
//
// Message bodies are markdown plus bible-quote markers, rendered by the
// imperative `renderMessageInto` (render.js + quotes.js) into a ref — so all the
// quote parsing, popups and sanitization stay exactly as they were, just wrapped
// in a Preact component.
import { html, useRef, useLayoutEffect } from "../vendor/preact.standalone.js";
import { renderMessageInto } from "../render.js";

/** The static welcome bubble, translated from the current UI strings. */
export function Welcome({ t }) {
  return html`
    <div class="msg msg-assistant">
      <div class="msg-body">
        <p>${t.welcome_greeting}</p>
        <p>${t.welcome_body} <em>${t.welcome_keyword}</em> ${t.welcome_body_end}</p>
      </div>
    </div>
  `;
}

/**
 * A message body filled by the imperative markdown/quote renderer. `md` is the
 * raw message text; changing it (e.g. streaming tokens) re-renders in place.
 */
export function MessageBody({ md, lang, className = "msg-body" }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (ref.current) renderMessageInto(ref.current, md ?? "", { lang });
  }, [md, lang, className]);
  return html`<div class=${className} ref=${ref}></div>`;
}

/** The error bubble body: a generic message, or a friendly one for insufficient OpenRouter credits. */
function ErrorBody({ draft, t }) {
  if (draft.errorCode === "insufficient_credits") {
    const [before, after] = t.error_credits.split("{refill}");
    const word = draft.errorRefillUrl
      ? html`<a href=${draft.errorRefillUrl} target="_blank" rel="noopener noreferrer">${t.error_credits_refill}</a>`
      : t.error_credits_refill;
    return html`<div class="error">${before}${word}${after}</div>`;
  }
  return html`<div class="error">${t.error_prefix}${draft.error}</div>`;
}

/** A "Reading …" / "Read …" note for a passage Philip fetched while answering. */
export function ReadNote({ reference, translation, reading, t }) {
  const text = (reading ? t.reading : t.read)
    .replace("{reference}", reference)
    .replace("{translation}", translation);
  return html`<div class="read-note">${text}</div>`;
}

/** A "Searching for …" / "Searched for …" note for a semantic search Philip ran. */
export function SearchNote({ query, searching, t }) {
  const text = (searching ? t.searching : t.searched).replace("{query}", query);
  return html`<div class="read-note">${text}</div>`;
}

/** Render one turn "activity" note — either a passage read or a semantic search. */
function ActivityNote({ item, live, t }) {
  return item.kind === "search"
    ? html`<${SearchNote} query=${item.query} searching=${live} t=${t} />`
    : html`<${ReadNote} reference=${item.reference} translation=${item.translation} reading=${live} t=${t} />`;
}

/** A committed user/assistant bubble. */
function Bubble({ role, content, lang }) {
  return html`
    <div class=${`msg msg-${role}`}>
      <${MessageBody} md=${content} lang=${lang} />
    </div>
  `;
}

/**
 * The turn currently streaming in: finalized read notes, the in-flight read, and
 * the assistant bubble (pulsing while it "thinks", then filling with the reply,
 * or showing an error).
 */
function ActiveTurn({ draft, lang, t }) {
  const cls = "msg-body" + (draft.thinking ? " thinking" : "");
  return html`
    ${draft.activity.map((item, i) => html`<${ActivityNote} key=${"a" + i} item=${item} live=${false} t=${t} />`)}
    ${draft.pending && html`<${ActivityNote} item=${draft.pending} live=${true} t=${t} />`}
    <div class="msg msg-assistant">
      ${draft.error
        ? html`<div class=${cls}><${ErrorBody} draft=${draft} t=${t} /></div>`
        : html`<${MessageBody} className=${cls} md=${draft.content || ""} lang=${lang} />`}
    </div>
  `;
}

/** The full log contents: welcome, committed messages, then the active turn. */
export function MessageList({ msgs, draft, lang, t }) {
  return html`
    <${Welcome} t=${t} />
    ${msgs.map((m, i) =>
      m.role === "read"
        ? html`<${ReadNote} key=${i} reference=${m.reference} translation=${m.translation} reading=${false} t=${t} />`
        : m.role === "search"
          ? html`<${SearchNote} key=${i} query=${m.query} searching=${false} t=${t} />`
          : html`<${Bubble} key=${i} role=${m.role} content=${m.content} lang=${lang} />`,
    )}
    ${draft && html`<${ActiveTurn} draft=${draft} lang=${lang} t=${t} />`}
  `;
}
