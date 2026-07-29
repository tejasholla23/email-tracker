"use client";

import { useEffect } from "react";

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

export default function AutoReload() {
  useEffect(() => {
    let timer = setTimeout(() => window.location.reload(), INACTIVITY_TIMEOUT);

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.location.reload(), INACTIVITY_TIMEOUT);
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, resetTimer)
      );
    };
  }, []);

  return null;
}
