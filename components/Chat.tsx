"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ChatMessage } from "@/lib/types";
import SourceChips from "./SourceChips";
import { ArrowUpIcon, EraseIcon, RetryIcon } from "./icons";

const STORAGE_KEY = "five-concierge-chat";

const SUGGESTIONS = [
  "What's the vibe at Bohemia beach club?",
  "Where should we party in Dubai on a Friday night?",
  "Tell me about the ReFIVE spa",
  "What's happening at Destino FIVE in Ibiza?",
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late?";
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadHistory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* storage full or private mode; history just won't persist */
    }
  }, [messages, hydrated]);

  useEffect(() => {
    if (pending || messages.length > 0) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, pending]);

  const send = useCallback(
    async (history: ChatMessage[]) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Something went wrong.");
        setMessages([
          ...history,
          { role: "assistant", content: data.reply, sources: data.sources ?? [] },
        ]);
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "The concierge couldn't be reached. Please try again.",
        );
      } finally {
        setPending(false);
      }
    },
    [],
  );

  function submit(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void send(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(draft);
    }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function clearConversation() {
    setMessages([]);
    setError(null);
  }

  const empty = hydrated && messages.length === 0 && !pending;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        {empty ? (
          <div className="pt-14 sm:pt-20">
            <h1 className="font-serif text-3xl italic">{greeting()}</h1>
            <p className="mt-3 max-w-[52ch] text-muted">
              Ask about FIVE&apos;s hotels, tables, parties and spa, across
              Dubai, Zurich and Ibiza. Every answer cites the page it came
              from.
            </p>
            <ul className="mt-10 border-t border-hairline">
              {SUGGESTIONS.map((s) => (
                <li key={s} className="border-b border-hairline">
                  <button
                    type="button"
                    onClick={() => submit(s)}
                    className="group flex w-full items-center justify-between gap-4 py-3.5 text-left text-sm text-muted transition-colors duration-150 hover:text-ink"
                  >
                    {s}
                    <span className="text-faint transition-transform duration-200 ease-out-quart group-hover:translate-x-0.5 group-hover:text-gold-text">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-8 py-8" aria-live="polite">
            {messages.map((message, i) =>
              message.role === "user" ? (
                <li key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 whitespace-pre-wrap">
                    {message.content}
                  </p>
                </li>
              ) : (
                <li key={i} className="space-y-3">
                  <p className="max-w-[68ch] leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <SourceChips sources={message.sources ?? []} />
                </li>
              ),
            )}
            {pending && (
              <li aria-label="The concierge is writing" className="space-y-2.5">
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-raised" />
                <div className="h-3.5 w-3/5 animate-pulse rounded bg-raised [animation-delay:120ms]" />
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-raised [animation-delay:240ms]" />
              </li>
            )}
            {error && (
              <li className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm">
                <span className="text-danger">{error}</span>
                <button
                  type="button"
                  onClick={() => void send(messages)}
                  className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-4 hover:underline"
                >
                  <RetryIcon className="size-3.5" />
                  Try again
                </button>
              </li>
            )}
            <div ref={endRef} className="scroll-mb-32" />
          </ol>
        )}
      </div>

      <div className="sticky bottom-0 bg-bg pb-4 sm:pb-6">
        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 rounded-2xl border border-hairline bg-surface p-2 transition-colors duration-150 focus-within:border-gold/45"
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autoResize();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask the concierge…"
            aria-label="Ask the concierge"
            className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-1.5 outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={pending || draft.trim() === ""}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-gold-ink transition-[background-color,opacity] duration-150 hover:bg-gold-hover disabled:cursor-default disabled:opacity-35"
          >
            <ArrowUpIcon />
          </button>
        </form>
        {messages.length > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearConversation}
              className="inline-flex items-center gap-1.5 text-xs text-faint transition-colors duration-150 hover:text-muted"
            >
              <EraseIcon className="size-3.5" />
              Clear conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
