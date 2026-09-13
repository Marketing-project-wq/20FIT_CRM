"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLoading(false);
    setProgress(0);
  }, [pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href === pathname) return;
      setLoading(true);
      setProgress(15);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  useEffect(() => {
    if (!loading) return;
    const t1 = setTimeout(() => setProgress(45), 200);
    const t2 = setTimeout(() => setProgress(70), 600);
    const t3 = setTimeout(() => setProgress(85), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [loading]);

  if (!loading) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[3px]">
      <div
        className="h-full bg-red transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
