import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Clock, TrendingUp, ArrowRight } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ── Recent queries (localStorage) ──

const RECENT_KEY = "browseai_recent_queries";
const MAX_RECENT = 8;

function getRecentQueries(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveRecentQuery(query: string) {
  const recent = getRecentQueries().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// ── Suggest API ──

const suggestCache = new Map<string, string[]>();

async function fetchSuggestions(query: string): Promise<string[]> {
  const key = query.trim().toLowerCase();
  if (suggestCache.has(key)) return suggestCache.get(key)!;

  try {
    const res = await fetch(
      `${API_BASE}/browse/suggest?q=${encodeURIComponent(query.trim())}`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.result || []) as string[];
    suggestCache.set(key, results);
    // Cap in-memory cache size
    if (suggestCache.size > 200) {
      const first = suggestCache.keys().next().value;
      if (first) suggestCache.delete(first);
    }
    return results;
  } catch {
    return [];
  }
}

// ── Component ──

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  size?: "default" | "large";
  disabled?: boolean;
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask a research question…",
  autoFocus = false,
  className = "",
  size = "default",
  disabled = false,
}: SearchInputProps) {
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [apiSuggestions, setApiSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch from suggest API
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setApiSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(q).then(setApiSuggestions);
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Build combined suggestions
  const suggestions = buildSuggestions(value, apiSuggestions);
  const hasSuggestions = suggestions.length > 0;

  // Show dropdown when focused and has suggestions
  useEffect(() => {
    setShowDropdown(focused && hasSuggestions);
    setSelectedIndex(-1);
  }, [focused, hasSuggestions, value]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown) {
        if (e.key === "Enter") {
          onSubmit(value);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          const selected = suggestions[selectedIndex].text;
          onChange(selected);
          onSubmit(selected);
        } else {
          onSubmit(value);
        }
        setShowDropdown(false);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      } else if (e.key === "Tab" && selectedIndex >= 0) {
        e.preventDefault();
        onChange(suggestions[selectedIndex].text);
      }
    },
    [showDropdown, suggestions, selectedIndex, value, onChange, onSubmit],
  );

  const handleSelect = (text: string) => {
    onChange(text);
    onSubmit(text);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const isLarge = size === "large";

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${
            isLarge ? "w-5 h-5 left-4" : "w-4 h-4"
          }`}
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label="Research query"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          className={`w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono transition-all ${
            isLarge
              ? "h-14 pl-12 pr-4 rounded-xl text-base"
              : "h-12 pl-10 pr-4 rounded-lg text-sm"
          } ${showDropdown ? "rounded-b-none border-b-transparent" : ""}`}
        />
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full bg-secondary border border-border border-t-0 rounded-b-lg shadow-lg overflow-hidden"
          >
            {suggestions.map((item, i) => (
              <button
                key={`${item.type}-${i}-${item.text}`}
                onMouseDown={() => handleSelect(item.text)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-muted/50"
                }`}
              >
                {item.type === "recent" ? (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : item.type === "trending" ? (
                  <TrendingUp className="w-3.5 h-3.5 text-accent/60 shrink-0" />
                ) : (
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 truncate text-xs">{item.text}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Suggestion logic ──

type Suggestion = { text: string; type: "recent" | "trending" | "suggest" };

function buildSuggestions(input: string, apiResults: string[]): Suggestion[] {
  const q = input.trim().toLowerCase();
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  const add = (text: string, type: Suggestion["type"]) => {
    const key = text.toLowerCase();
    if (!seen.has(key) && key !== q) {
      seen.add(key);
      suggestions.push({ text, type });
    }
  };

  const recent = getRecentQueries();

  if (!q) {
    // Empty input: show recent queries only
    for (const r of recent.slice(0, 5)) add(r, "recent");
  } else {
    // Matching recent queries first
    for (const r of recent) {
      if (r.toLowerCase().includes(q)) add(r, "recent");
    }
    // API suggestions
    for (const s of apiResults) {
      add(s, "suggest");
    }
  }

  return suggestions.slice(0, 8);
}
