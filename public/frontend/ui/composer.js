// The message composer: an auto-growing textarea plus the Send button. Enter
// submits, Shift+Enter inserts a newline. Once the text spills past one line the
// form goes "multiline" so the button stacks and the textarea gets more room.
import { html, useRef, useEffect } from "../vendor/preact.standalone.js";

export function Composer({ value, onInput, onSubmit, busy, t, inputRef }) {
  const formRef = useRef(null);
  const ownRef = useRef(null);
  const input = inputRef || ownRef;

  // Resize the textarea to fit its content and toggle the multiline layout.
  function autoGrow() {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    const height = el.scrollHeight;
    el.style.height = height + "px";
    const cs = getComputedStyle(el);
    const oneLine =
      parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    formRef.current?.classList.toggle("multiline", height > oneLine + 1);
  }

  // Re-fit whenever the value changes (typing, or a programmatic clear on send).
  useEffect(autoGrow, [value]);

  return html`
    <form
      id="composer"
      class="composer"
      ref=${formRef}
      onSubmit=${(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        id="input"
        ref=${input}
        rows="1"
        placeholder=${t.placeholder}
        autocomplete="off"
        disabled=${busy}
        value=${value}
        onInput=${(e) => onInput(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      ></textarea>
      <div class="composer-actions">
        <button id="send" type="submit" disabled=${busy}>${t.send}</button>
      </div>
    </form>
  `;
}
