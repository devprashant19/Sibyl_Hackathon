"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-8 h-8 rounded-md bg-surface-raised" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-md hover:bg-surface-raised text-text-muted hover:text-text transition-colors flex items-center justify-center"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <span className="material-symbols-outlined text-[20px]">light_mode</span>
      ) : (
        <span className="material-symbols-outlined text-[20px]">dark_mode</span>
      )}
    </button>
  );
}
