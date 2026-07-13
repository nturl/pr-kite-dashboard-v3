"use client";

import { useState, useRef, useEffect } from "react";
import { SpotWithWind } from "@/lib/spots";
import { ChatMessage } from "@/lib/gemini";

interface Props {
  spots:        SpotWithWind[];
  userProfile?: { heightCm: number; weightKg: number };
}

const SUGGESTIONS = [
  "Best spot to kite right now?",
  "Is the sea breeze up at Topsail?",
  "Where's it windiest — NC, NY, or NJ?",
  "Is Sandy Hook worth the drive today?",
];

export default function GeminiChat({ spots, userProfile }: Props) {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [hasKey, setHasKey]     = useState<boolean | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  // Check if Gemini is available
  useEffect(() => {
    if (!open || hasKey !== null) return;
    fetch("/api/ai/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messages: [{ role: "user", content: "ping" }], spots: [] }),
    }).then((r) => setHasKey(r.status !== 503)).catch(() => setHasKey(false));
  }, [open, hasKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: newMessages, spots, userProfile }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "model", content: data.reply }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "model", content: "Sorry, I couldn't reach Gemini. Check your API key." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position:     "fixed",
          bottom:       24,
          right:        24,
          width:        52,
          height:       52,
          borderRadius: "50%",
          background:   open ? "rgba(0,229,255,0.15)" : "rgba(5,10,20,0.95)",
          border:       "1.5px solid rgba(0,229,255,0.4)",
          boxShadow:    "0 4px 24px rgba(0,229,255,0.2), 0 0 0 4px rgba(0,229,255,0.06)",
          cursor:       "pointer",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     22,
          zIndex:       2000,
          transition:   "all 0.2s",
        }}
        title="Ask Gemini about conditions"
      >
        {open ? "✕" : "✦"}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position:     "fixed",
          bottom:       88,
          right:        24,
          width:        360,
          height:       480,
          background:   "rgba(5,10,20,0.97)",
          border:       "1px solid rgba(0,229,255,0.2)",
          borderRadius: 18,
          boxShadow:    "0 16px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,229,255,0.08)",
          backdropFilter: "blur(24px)",
          zIndex:       1999,
          display:      "flex",
          flexDirection: "column",
          overflow:     "hidden",
          animation:    "slideUp 0.2s ease",
        }}>
          {/* Header */}
          <div style={{
            padding:     "14px 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display:     "flex",
            alignItems:  "center",
            gap:         10,
            flexShrink:  0,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(0,229,255,0.1)",
              border: "1px solid rgba(0,229,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>✦</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#fff" }}>
                Ask Gemini
              </div>
              <div style={{ fontSize: 10, color: "rgba(0,229,255,0.5)", letterSpacing: "0.08em" }}>
                {hasKey === false ? "⚠ API key needed" : "conditions loaded"}
              </div>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}>
                clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", marginBottom: 4 }}>
                  Try asking about today&apos;s conditions
                </div>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} style={{
                    background:   "rgba(0,229,255,0.05)",
                    border:       "1px solid rgba(0,229,255,0.15)",
                    borderRadius: 10,
                    padding:      "8px 12px",
                    fontSize:     12,
                    color:        "rgba(255,255,255,0.65)",
                    cursor:       "pointer",
                    textAlign:    "left",
                    transition:   "all 0.15s",
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf:    m.role === "user" ? "flex-end" : "flex-start",
                maxWidth:     "88%",
              }}>
                {m.role === "model" && (
                  <div style={{ fontSize: 9, color: "rgba(0,229,255,0.4)", marginBottom: 3, letterSpacing: "0.08em", fontWeight: 600 }}>
                    ✦ GEMINI
                  </div>
                )}
                <div style={{
                  background:   m.role === "user" ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.05)",
                  border:       `1px solid ${m.role === "user" ? "rgba(0,229,255,0.25)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  padding:      "9px 12px",
                  fontSize:     12,
                  color:        "rgba(255,255,255,0.85)",
                  lineHeight:   1.6,
                  whiteSpace:   "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5ff", animation: "pulse 1s infinite" }} />
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5ff", animation: "pulse 1s infinite 0.2s" }} />
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5ff", animation: "pulse 1s infinite 0.4s" }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding:      "10px 12px",
            borderTop:    "1px solid rgba(255,255,255,0.07)",
            display:      "flex",
            gap:          8,
            flexShrink:   0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Ask about conditions..."
              disabled={loading}
              style={{
                flex:         1,
                background:   "rgba(255,255,255,0.05)",
                border:       "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding:      "8px 12px",
                fontSize:     12,
                color:        "#fff",
                outline:      "none",
                fontFamily:   "inherit",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              style={{
                background:   input.trim() ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.04)",
                border:       `1px solid ${input.trim() ? "rgba(0,229,255,0.35)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 10,
                padding:      "8px 12px",
                color:        input.trim() ? "#00e5ff" : "rgba(255,255,255,0.2)",
                fontSize:     14,
                cursor:       input.trim() ? "pointer" : "default",
                transition:   "all 0.15s",
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
