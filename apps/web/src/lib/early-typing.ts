"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * Keeps what someone typed before the page's scripts loaded.
 *
 * On a slow phone or a slow first load, the page shows its fields before React is ready.
 * Text typed in that gap sits in the field but never reaches React state, so the form
 * would save it as empty. Once React is ready, this reads every named field in the form
 * and hands its value to `apply`, which copies it into state. A field nobody touched
 * already matches state, so setting it again changes nothing.
 *
 * Pair it with method="post" on the form, so a press of the button in that gap reloads
 * the page instead of putting names and emails in the address bar.
 */
export function useEarlyTyping(form: RefObject<HTMLFormElement | null>, apply: (name: string, value: string, checked: boolean) => void) {
  const set = useEffectEvent(apply);
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    for (const c of Array.from(el.elements)) {
      if (c instanceof HTMLInputElement) {
        if (!c.name || c.type === "submit" || c.type === "button" || c.type === "hidden" || c.type === "file") continue;
        // A radio group reports only the chosen one.
        if (c.type === "radio" && !c.checked) continue;
        set(c.name, c.value, c.checked);
      } else if ((c instanceof HTMLTextAreaElement || c instanceof HTMLSelectElement) && c.name) {
        set(c.name, c.value, true);
      }
    }
  }, [form]);
}
