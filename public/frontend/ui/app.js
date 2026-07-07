// The root component: it owns the conversation, the saved-conversation list, the
// theme, and the streaming turn, and wires them to the header, log, composer and
// about overlay. The pure logic modules (state, chat-client, summary-client,
// conversations, i18n) and the imperative quote renderer are reused unchanged —
// this component just replaces the hand-written DOM wiring that used to live in
// app.js with declarative Preact components.
import {
  html,
  useState,
  useRef,
  useEffect,
} from "../vendor/preact.standalone.js";

import { createState, addMessage, toHistory } from "../state.js";
import { streamChat } from "../chat-client.js";
import { summarizeConversation } from "../summary-client.js";
import {
  addRecord,
  applySummary,
  makeRecord,
  removeRecord,
  renameRecord,
  sanitizeList,
} from "../conversations.js";
import { detectLang, getStrings } from "../../i18n.js";

import { Topbar } from "./header.js";
import { MessageList } from "./messages.js";
import { Composer } from "./composer.js";
import { AboutOverlay } from "./about.js";

const THEME_KEY = "philip:theme";
const STORAGE_KEY = "philip:conversation";
const CONVERSATIONS_KEY = "philip:conversations";

export function App() {
  const [lang, setLang] = useState(detectLang);
  const t = getStrings(lang);

  // The active conversation lives in this mutable store (state.js); `msgs` is a
  // snapshot of store.messages that drives rendering. Committing = snapshot.
  const store = useRef(createState());
  const [msgs, setMsgs] = useState([]);
  const commit = () => setMsgs(store.current.messages.slice());

  const [conversations, setConversations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [theme, setThemeState] = useState(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [shareFlash, setShareFlash] = useState(null);

  // The in-progress streaming turn (null when idle). Kept in a ref for cheap
  // per-token mutation; `setDraft` snapshots it to trigger a render.
  const draftRef = useRef(null);
  const [draft, setDraftState] = useState(null);
  const pushDraft = () =>
    setDraftState(draftRef.current ? { ...draftRef.current } : null);

  const logRef = useRef(null);
  const spacerRef = useRef(null);
  const topbarRef = useRef(null);
  const inputRef = useRef(null);
  const shareTimer = useRef(null);

  const switchLang = (newLang) => setLang((cur) => (newLang === cur ? cur : newLang));

  // --- Persistence -------------------------------------------------------
  function saveConversation() {
    try {
      const s = store.current;
      const data = { messages: s.messages, lang };
      if (s.condensedSummary) {
        data.condensedSummary = s.condensedSummary;
        data.condensedUpToIndex = s.condensedUpToIndex;
      }
      if (s.lastRequestAt) data.lastRequestAt = s.lastRequestAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

  function saveConversationsRaw(list) {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("[philip] could not save conversation list", e);
    }
  }

  function commitConversations(list) {
    setConversations(list);
    saveConversationsRaw(list);
  }

  /** Replace the active conversation's messages (from storage or a snapshot). */
  function loadMessages(messages) {
    store.current.messages = messages.map((m) =>
      m.role === "read"
        ? { role: "read", reference: m.reference, translation: m.translation }
        : { role: m.role, content: m.content },
    );
    commit();
  }

  // --- Theme -------------------------------------------------------------
  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage may be unavailable */
    }
    setThemeState(next);
  }

  // --- Share readiness ---------------------------------------------------
  function hasReply() {
    const list = store.current.messages;
    return (
      list.some((m) => m.role === "user" && m.content?.trim()) &&
      list.some((m) => m.role === "assistant" && m.content?.trim())
    );
  }
  const shareReady = hasReply();
  const shareLabel = shareFlash ?? t.share;

  function flashShare(text) {
    clearTimeout(shareTimer.current);
    setShareFlash(text);
    shareTimer.current = setTimeout(() => setShareFlash(null), 4000);
  }

  // --- Saved conversations ----------------------------------------------
  /** Archive the active conversation into `list`, returning the new list. */
  function archiveInto(list) {
    if (!hasReply()) return list;
    const messages = toHistory(store.current);
    const recordLang = lang;
    const record = makeRecord({ messages, lang: recordLang, title: "", summary: "" });
    const next = addRecord(list, record);
    // Upgrade the fallback label asynchronously; the fallback survives failure.
    summarizeConversation({ messages, lang: recordLang }).then(({ title, summary }) => {
      if (!title && !summary) return;
      setConversations((prev) => {
        const updated = applySummary(prev, record.id, { title, summary });
        saveConversationsRaw(updated);
        return updated;
      });
    });
    return next;
  }

  function resetActive() {
    clearStoredConversation();
    store.current = createState();
    draftRef.current = null;
    setDraftState(null);
    if (spacerRef.current) spacerRef.current.style.height = "";
    commit();
    inputRef.current?.focus();
  }

  function dropShareParam() {
    const url = new URL(location.href);
    url.searchParams.delete("c");
    history.replaceState(null, "", url.toString());
  }

  function newChat() {
    commitConversations(archiveInto(conversations));
    resetActive();
    dropShareParam();
  }

  function openConversation(id) {
    const target = conversations.find((c) => c.id === id);
    if (!target) return;
    let list = archiveInto(conversations);
    list = removeRecord(list, id);
    commitConversations(list);
    if (typeof target.lang === "string") switchLang(target.lang);
    draftRef.current = null;
    setDraftState(null);
    loadMessages(target.messages);
    saveConversation();
    setSavedOpen(false);
    if (logRef.current) logRef.current.scrollTop = 0;
  }

  function renameConversation(id) {
    const current = conversations.find((c) => c.id === id);
    const next = window.prompt(t.rename_prompt, current?.title || "");
    if (next == null) return;
    commitConversations(renameRecord(conversations, id, next));
  }

  function deleteConversation(id) {
    if (!window.confirm(t.delete_confirm)) return;
    commitConversations(removeRecord(conversations, id));
  }

  // --- Share -------------------------------------------------------------
  async function share() {
    if (!shareReady) return;
    const messages = toHistory(store.current);
    if (messages.length === 0) {
      flashShare(t.share_empty);
      return;
    }
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
    }
  }

  // --- Streaming a turn --------------------------------------------------
  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    addMessage(store.current, "user", trimmed);
    commit();
    setInput("");
    setBusy(true);

    const outgoing = toHistory(store.current);
    const turnLang = lang;

    draftRef.current = { reads: [], pendingRead: null, content: null, thinking: true, error: null };
    pushDraft();

    // Anchor this turn near the top and reserve a screen of space below, so the
    // reply grows downward instead of pushing the reader's position up.
    requestAnimationFrame(() => {
      const log = logRef.current;
      if (log && spacerRef.current) spacerRef.current.style.height = `${log.clientHeight}px`;
      const users = log?.querySelectorAll(".msg-user");
      users?.[users.length - 1]?.scrollIntoView({ block: "start" });
    });

    let contentStr = "";
    let hasContent = false;
    let frame = 0;
    const flush = () => {
      frame = 0;
      draftRef.current.content = contentStr;
      pushDraft();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const finalizeRead = () => {
      if (!draftRef.current.pendingRead) return;
      draftRef.current.reads.push(draftRef.current.pendingRead);
      draftRef.current.pendingRead = null;
    };

    let failure = null;
    await streamChat({
      messages: outgoing,
      lang: turnLang,
      lastRequestAt: store.current.lastRequestAt || undefined,
      condensedSummary: store.current.condensedSummary || undefined,
      onLang: (nl) => switchLang(nl),
      onToken: (token) => {
        finalizeRead();
        draftRef.current.thinking = false;
        hasContent = true;
        contentStr += token;
        schedule();
      },
      onStatus: (status) => {
        if (status?.type !== "reading") return;
        finalizeRead();
        draftRef.current.pendingRead = {
          reference: status.reference ?? "",
          translation: status.translation ?? "",
        };
        pushDraft();
      },
      onCondensed: ({ summary, upToIndex }) => {
        store.current.condensedSummary = summary;
        // Map upToIndex (over user/assistant turns) to a store.messages index.
        let count = 0;
        let fullIndex = 0;
        const list = store.current.messages;
        for (let i = 0; i < list.length; i++) {
          if (list[i].role === "user" || list[i].role === "assistant") count++;
          if (count >= upToIndex) {
            fullIndex = i + 1;
            break;
          }
        }
        store.current.condensedUpToIndex = fullIndex;
      },
      onError: (message, info) => {
        failure = { message, code: info?.code, refillUrl: info?.refillUrl };
      },
    });

    store.current.lastRequestAt = Date.now();
    finalizeRead();
    if (frame) cancelAnimationFrame(frame);

    // Fold the turn into the persisted store: the read notes always, the
    // assistant reply only if it produced text and didn't fail.
    for (const r of draftRef.current.reads) {
      store.current.messages.push({ role: "read", reference: r.reference, translation: r.translation });
    }

    if (failure) {
      console.error("[philip]", failure.message);
      // Keep an ephemeral error bubble; it isn't persisted or resent.
      draftRef.current = {
        reads: [],
        pendingRead: null,
        content: null,
        thinking: false,
        error: failure.message,
        errorCode: failure.code,
        errorRefillUrl: failure.refillUrl,
      };
      pushDraft();
    } else {
      if (hasContent) addMessage(store.current, "assistant", contentStr);
      draftRef.current = null;
      setDraftState(null);
    }

    if (spacerRef.current) spacerRef.current.style.height = "";
    commit();
    saveConversation();
    setBusy(false);
    inputRef.current?.focus();
  }

  // --- Boot: restore this browser's conversation or a shared snapshot -----
  useEffect(() => {
    let list = [];
    try {
      list = sanitizeList(JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || "null"));
    } catch {
      list = [];
    }
    setConversations(list);

    async function loadShared(id) {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(id)}`);
        if (!res.ok) return false;
        const data = await res.json();
        if (!data || !Array.isArray(data.messages)) return false;
        if (typeof data.lang === "string") switchLang(data.lang);
        loadMessages(data.messages);
        saveConversation();
        return true;
      } catch (e) {
        console.error("[philip] loadSharedConversation failed", e);
        return false;
      }
    }

    function restore() {
      let stored;
      try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      } catch {
        return;
      }
      if (!stored || !Array.isArray(stored.messages) || stored.messages.length === 0) return;
      if (typeof stored.lang === "string") switchLang(stored.lang);
      loadMessages(stored.messages);
      if (typeof stored.condensedSummary === "string") {
        store.current.condensedSummary = stored.condensedSummary;
        store.current.condensedUpToIndex = stored.condensedUpToIndex ?? 0;
      }
      if (typeof stored.lastRequestAt === "number") store.current.lastRequestAt = stored.lastRequestAt;
    }

    const urlId = new URLSearchParams(location.search).get("c");
    if (urlId) loadShared(urlId).finally(dropShareParam);
    else restore();

    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the document title and <html lang> in step with the UI language.
  useEffect(() => {
    document.title = t.title;
    document.documentElement.lang = lang;
  }, [lang, t.title]);

  // --- Mobile: auto-hide the header while reading ------------------------
  useEffect(() => {
    const topbar = topbarRef.current;
    const log = logRef.current;
    if (!topbar || !log) return;

    const measure = () =>
      document.documentElement.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
    measure();
    window.addEventListener("resize", measure);

    let lastTop = log.scrollTop;
    let ticking = false;
    const update = () => {
      ticking = false;
      const top = log.scrollTop;
      const delta = top - lastTop;
      if (Math.abs(delta) < 4) return;
      if (delta > 0 && top > topbar.offsetHeight) document.body.classList.add("header-hidden");
      else if (delta < 0) document.body.classList.remove("header-hidden");
      lastTop = top;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    log.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      log.removeEventListener("scroll", onScroll);
    };
  }, []);

  // --- Dismiss the saved dropdown on Escape or an outside click ----------
  useEffect(() => {
    if (!savedOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSavedOpen(false);
    };
    const onPointer = (e) => {
      const nav = document.getElementById("conversations");
      const toggle = document.getElementById("toggle-conversations");
      if (nav?.contains(e.target) || toggle?.contains(e.target)) return;
      setSavedOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [savedOpen]);

  return html`
    <${Topbar}
      t=${t}
      topbarRef=${topbarRef}
      conversations=${conversations}
      savedOpen=${savedOpen}
      onToggleSaved=${() => setSavedOpen((o) => !o)}
      onOpenConversation=${openConversation}
      onRenameConversation=${renameConversation}
      onDeleteConversation=${deleteConversation}
      shareReady=${shareReady}
      shareLabel=${shareLabel}
      onShare=${share}
      onNew=${newChat}
      aboutOpen=${aboutOpen}
      onAbout=${() => setAboutOpen(true)}
      theme=${theme}
      onToggleTheme=${() => setTheme(theme === "dark" ? "light" : "dark")}
    />

    <main id="log" class="log" aria-live="polite" ref=${logRef}>
      <${MessageList} msgs=${msgs} draft=${draft} lang=${lang} t=${t} />
      <div class="log-spacer" ref=${spacerRef} aria-hidden="true"></div>
    </main>

    <${Composer}
      value=${input}
      onInput=${setInput}
      onSubmit=${() => send(input)}
      busy=${busy}
      t=${t}
      inputRef=${inputRef}
    />

    <${AboutOverlay} open=${aboutOpen} t=${t} onClose=${() => setAboutOpen(false)} />
  `;
}
