"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SourceLinks from "./SourceLinks";
import type { ChatMessage } from "@/lib/types";

const STORAGE_KEY = "five-concierge-chat-v1";

const SUGGESTED_PROMPTS = [
  "Dinner and a dancefloor in Dubai this Saturday?",
  "Which FIVE restaurants are in the Michelin Guide?",
  "What's the Pacha story at FIVE Ibiza?",
  "Plan me a low-key spa day",
];

/** Grounded concierge chat with localStorage persistence. */
export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore the conversation once on mount. Reading localStorage in an
  // effect (not a state initialiser) keeps server and first client render
  // identical, avoiding a hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* corrupted storage, start fresh */
    }
    setHydrated(true);
  }, []);

  // Persist after every exchange (skip until hydration to avoid wiping).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* storage full or unavailable; chat still works in-memory */
    }
  }, [messages, hydrated]);

  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || isLoading) return;
      setError(null);
      setInput("");
      const next: ChatMessage[] = [...messages, { role: "user", content }];
      setMessages(next);
      setIsLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Sources aren't needed server-side; keep the payload lean.
          body: JSON.stringify({
            messages: next.map(({ role, content }) => ({ role, content })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Request failed");
        setMessages([
          ...next,
          { role: "assistant", content: data.reply, sources: data.sources },
        ]);
      } catch (err) {
        setError(
          err instanceof Error && err.message !== "Failed to fetch"
            ? err.message
            : "The concierge couldn't be reached. Check your connection and try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading],
  );

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <section aria-label="Concierge chat" className="flex flex-1 flex-col">
      {/* Session header */}
      <div className="flex items-center justify-between pb-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sand">
          At your service
        </p>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-sand transition-colors hover:text-gold"
          >
            New chat
          </button>
        )}
      </div>

      {/* Conversation */}
      <div className="flex flex-1 flex-col gap-6">
        {hydrated && messages.length === 0 && !isLoading && <EmptyState onPick={send} />}

        {messages.map((message, i) =>
          message.role === "user" ? (
            <div key={i} className="animate-rise flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-gold/10 px-4 py-3 text-sm leading-relaxed text-ivory shadow-[inset_0_0_0_1px] shadow-gold/20 sm:max-w-[75%]">
                {message.content}
              </p>
            </div>
          ) : (
            <div key={i} className="animate-rise max-w-full sm:max-w-[88%]">
              <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                Concierge
              </p>
              <AssistantText content={message.content} />
              <SourceLinks sources={message.sources ?? []} />
            </div>
          ),
        )}

        {isLoading && <TypingIndicator />}

        {error && (
          <div className="animate-rise rounded-xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm text-ivory/90">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer: sticky so it stays reachable in long conversations */}
      <div className="sticky bottom-0 -mx-4 mt-8 bg-gradient-to-t from-night via-night/95 to-transparent px-4 pb-4 pt-6 sm:-mx-6 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-gold/30 bg-charcoal/90 p-2 backdrop-blur-md transition-colors focus-within:border-gold/60"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask the concierge anything…"
            aria-label="Message the concierge"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-ivory placeholder:text-sand/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-xl bg-gold px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-ink transition-all hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

/** Renders assistant prose: paragraphs and hyphen lists, markdown stripped. */
function AssistantText({ content }: { content: string }) {
  const blocks = content.replace(/\*\*?/g, "").split(/\n\n+/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ivory/90">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*[-•]\s+/.test(l));
        return isList ? (
          <ul key={i} className="space-y-1.5">
            {lines.map((line, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>{line.replace(/^\s*[-•]\s+/, "")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="animate-rise flex items-center gap-3" role="status" aria-label="Concierge is typing">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-gold">
        Concierge
      </p>
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-gold" />
        ))}
      </span>
    </div>
  );
}

/** First-visit state: greeting + tasteful starter prompts. */
function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="animate-rise flex flex-col items-start gap-6 py-6">
      <div>
        <p className="font-display text-2xl font-light italic text-ivory/90 sm:text-3xl">
          {greeting}.
        </p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-sand">
          Ask me about a table, a pool party, a treatment or a suite. I only
          speak from FIVE&apos;s own pages, and I&apos;ll always show you the
          exact one each answer came from.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPick(prompt)}
            className="hairline rounded-full border bg-charcoal/60 px-4 py-2 text-left text-xs text-ivory/80 transition-all hover:border-gold/50 hover:bg-onyx hover:text-ivory"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
