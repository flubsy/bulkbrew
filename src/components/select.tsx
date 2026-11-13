"use client";

import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";

/**
 * Drop-in replacement for <select>: same props and <option>/<optgroup> children, same
 * onChange(e) with e.target.value, but the list is drawn by the app instead of the browser
 * (native popups were failing to open for some people). Long lists get a filter box.
 * Keyboard: ↑/↓ change the value when closed; Enter, Space or Alt+↓ open; type to jump.
 */

interface Opt { value: string; label: string; disabled?: boolean; group?: string }

function textOf(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(n)) return textOf(n.props.children);
  return "";
}

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>;
    if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({ value: String(el.props.value ?? label), label, disabled: el.props.disabled, group });
    } else if (el.type === "optgroup") {
      collect(el.props.children, el.props.label, out);
    } else {
      collect(el.props.children, group, out); // fragments
    }
  });
  return out;
}

const FILTER_AT = 12;

export function Select({ className = "", children, value, defaultValue, onChange, disabled, id, "aria-label": ariaLabel, title }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => collect(children), [children]);
  const [inner, setInner] = useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  function choose(o: Opt | undefined) {
    if (!o || o.disabled) return;
    if (value === undefined) setInner(o.value);
    if (o.value !== current) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>);
  }

  function place() {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(320, options.length * 40 + (options.length >= FILTER_AT ? 56 : 8));
    const up = below < Math.min(want, 200) && above > below;
    setPos({ left: r.left, width: Math.max(r.width, 200), maxH: Math.max(120, Math.min(320, up ? above : below)), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }

  function openList() {
    if (disabled) return;
    place();
    setQ("");
    setActive(Math.max(0, options.indexOf(selected)));
    setOpen(true);
  }

  function close(focus = true) {
    setOpen(false);
    if (focus) button.current?.focus();
  }

  // Close on outside click, and when the page scrolls or resizes (the list is fixed-position).
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    const away = (e: Event) => { if (!list.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", down);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);

  // Focus the filter (long lists) and keep the active option in view.
  useLayoutEffect(() => {
    if (!open) return;
    if (options.length >= FILTER_AT) filterRef.current?.focus();
    else list.current?.focus();
  }, [open, options.length]);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function step(from: number, dir: 1 | -1, within: Opt[]) {
    for (let i = from + dir; i >= 0 && i < within.length; i += dir) if (!within[i].disabled) return i;
    return from;
  }

  function onButtonKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); openList(); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openList(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = options.indexOf(selected);
      choose(options[step(i, e.key === "ArrowDown" ? 1 : -1, options)]);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + e.key.toLowerCase() : e.key.toLowerCase(), at: now };
      choose(options.find((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text)));
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { close(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(Math.min(a, shown.length - 1), e.key === "ArrowDown" ? 1 : -1, shown)); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
    if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); return; }
    if (e.key === "Enter") { e.preventDefault(); choose(shown[active]); close(); }
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
        className={`px-input px-select px-border block truncate text-left disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        {selected?.label || " "}
      </button>
      {open && pos && (
        <div
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
          onKeyDown={onListKey}
          className="px-border px-border-orange fixed z-[80] flex flex-col bg-navy-900 outline-none"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          {options.length >= FILTER_AT && (
            <input
              ref={filterRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              placeholder="Type to filter…"
              aria-label="Filter options"
              className="m-2 shrink-0 bg-navy-700 px-2 py-1 text-[17px] text-cream outline-none placeholder:text-muted"
            />
          )}
          <div className="overflow-y-auto py-1">
            {shown.length === 0 && <div className="px-3 py-2 text-[16px] text-muted">No matches.</div>}
            {shown.map((o, i) => {
              const header = o.group && o.group !== shown[i - 1]?.group ? o.group : null;
              return (
                <div key={`${o.group ?? ""}:${o.value}:${i}`}>
                  {header && <div className="px-label !mb-0 px-3 pb-1 pt-2">{header}</div>}
                  <div
                    id={`${listId}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={o.value === current}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { choose(o); close(); }}
                    className={`cursor-pointer px-3 py-1.5 text-[17px] ${o.disabled ? "cursor-default text-muted" : i === active ? "bg-navy-600 text-cream" : "text-cream-dim"} ${o.value === current ? "text-orange" : ""}`}
                  >
                    {o.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
