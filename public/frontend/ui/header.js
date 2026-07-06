// The top bar: the title, the action chips (saved / share / new / about /
// theme), the tagline, and the saved-conversations dropdown.
import { html } from "../vendor/preact.standalone.js";

/** A header chip. Chips are anchors, so we swallow the default navigation. */
function Chip({ id, label, title, disabled, extraClass, onClick, ...rest }) {
  return html`
    <a
      href="#"
      id=${id}
      class=${"chip" + (extraClass ? " " + extraClass : "") + (disabled ? " disabled" : "")}
      title=${title}
      onClick=${(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      ...${rest}
    >
      ${label}
    </a>
  `;
}

function SavedDropdown({ open, conversations, t, onOpen, onRename, onDelete }) {
  return html`
    <nav
      id="conversations"
      class="conversations"
      aria-label=${t.conversations_title}
      hidden=${!(open && conversations.length > 0)}
    >
      <h2 id="conversations-title" class="conversations-title">${t.conversations_title}</h2>
      <ul id="conversation-list" class="conversation-list">
        ${conversations.map(
          (c) => html`
            <li key=${c.id} class="conversation-item">
              <button type="button" class="conversation-open" onClick=${() => onOpen(c.id)}>
                <span class="conversation-name">${c.title || t.conversation_untitled}</span>
                ${c.summary && html`<span class="conversation-summary">${c.summary}</span>`}
              </button>
              <div class="conversation-actions">
                <button type="button" class="conversation-action" onClick=${() => onRename(c.id)}>
                  ${t.rename}
                </button>
                <button type="button" class="conversation-action" onClick=${() => onDelete(c.id)}>
                  ${t.delete}
                </button>
              </div>
            </li>
          `,
        )}
      </ul>
    </nav>
  `;
}

export function Topbar({
  t,
  topbarRef,
  conversations,
  savedOpen,
  onToggleSaved,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
  shareReady,
  shareLabel,
  onShare,
  onNew,
  aboutOpen,
  onAbout,
  theme,
  onToggleTheme,
}) {
  const dark = theme === "dark";
  return html`
    <header class="topbar" ref=${topbarRef}>
      <img class="topbar-logo" src="./philip-icon.png" alt="" width="300" height="227" />
      <h1>Philip</h1>
      <${Chip}
        id="toggle-conversations"
        label=${t.conversations_toggle}
        title=${t.conversations_title}
        hidden=${conversations.length === 0}
        aria-expanded=${String(savedOpen)}
        aria-controls="conversations"
        onClick=${onToggleSaved}
      />
      <${Chip}
        id="share-chat"
        label=${shareLabel}
        title=${shareReady ? t.share : t.share_disabled}
        disabled=${!shareReady}
        aria-disabled=${String(!shareReady)}
        onClick=${onShare}
      />
      <${Chip} id="new-chat" label=${t.new_chat} title="Start a fresh conversation" onClick=${onNew} />
      <${Chip}
        id="about-link"
        label=${t.about.link}
        title=${t.about.title}
        aria-haspopup="dialog"
        aria-expanded=${String(aboutOpen)}
        onClick=${onAbout}
      />
      <${Chip}
        id="theme-toggle"
        extraClass="chip-theme"
        label=${dark ? "☀" : "☾"}
        title=${dark ? t.theme_to_light : t.theme_to_dark}
        aria-label=${dark ? t.theme_to_light : t.theme_to_dark}
        role="button"
        onClick=${onToggleTheme}
      />
      <p class="tagline">${t.tagline}</p>
      <${SavedDropdown}
        open=${savedOpen}
        conversations=${conversations}
        t=${t}
        onOpen=${onOpenConversation}
        onRename=${onRenameConversation}
        onDelete=${onDeleteConversation}
      />
    </header>
  `;
}
