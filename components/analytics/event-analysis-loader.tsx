"use client";

import { useState, useEffect } from "react";
import { Lottie } from "lottie-react";
import { useI18n } from "@/components/i18n/lang-provider";
import redBallData from "./red-ball-lottie.json";

const PHASE_INTERVAL_MS = 2400;

export function EventAnalysisLoader({ variant = "full" }: { variant?: "full" | "inline" }) {
  const { t } = useI18n();
  const phases = [
    t.eventAnalysis.loadingPhase1,
    t.eventAnalysis.loadingPhase2,
    t.eventAnalysis.loadingPhase3,
  ];

  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((p) => (p + 1) % phases.length);
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phases.length]);

  if (variant === "inline") {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        <Lottie src={redBallData} loop autoplay style={{ width: 32, height: 32 }} aria-hidden />
        <span className="ea-phase-text font-body text-[13px] font-semibold text-ink-soft">
          {phases[phase]}
        </span>
        <style>{sharedStyles}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5">
      <Lottie src={redBallData} loop autoplay style={{ width: 80, height: 80 }} aria-hidden />

      <div className="flex flex-col items-center gap-2.5">
        <span className="ea-phase-text font-display text-[15px] font-bold text-ink" key={phase}>
          {phases[phase]}
        </span>
        <div className="ea-progress-track">
          <div className="ea-progress-fill" />
        </div>
      </div>

      <style>{sharedStyles}</style>
    </div>
  );
}

export function EventAnalysisLoaderServer() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5">
      <div className="ea-ball-fallback" aria-hidden />

      <div className="flex flex-col items-center gap-2.5">
        <span className="ea-phase-text font-display text-[15px] font-bold text-ink">
          Loading...
        </span>
        <div className="ea-progress-track">
          <div className="ea-progress-fill" />
        </div>
      </div>

      <style>{sharedStyles}</style>
    </div>
  );
}

const sharedStyles = `
  /* Phase text crossfade */
  .ea-phase-text {
    animation: ea-fade-in 400ms ease-out;
  }
  @keyframes ea-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Progress bar */
  .ea-progress-track {
    width: 12rem;
    height: 3px;
    border-radius: 2px;
    background: var(--surface-border);
    overflow: hidden;
  }
  .ea-progress-fill {
    width: 40%;
    height: 100%;
    border-radius: 2px;
    background: var(--red);
    animation: ea-slide 1.8s ease-in-out infinite;
  }
  @keyframes ea-slide {
    0%   { transform: translateX(-100%); }
    50%  { transform: translateX(200%); }
    100% { transform: translateX(-100%); }
  }

  /* Server-side CSS fallback ball */
  .ea-ball-fallback {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.25), transparent 50%), var(--red);
    animation: ea-ball-bounce 1s cubic-bezier(0.12, 0, 0.39, 0) infinite alternate;
    box-shadow: 0 0 0 rgba(0,0,0,0);
  }
  @keyframes ea-ball-bounce {
    0% {
      transform: translateY(-24px) scaleX(1) scaleY(1);
      box-shadow: 0 24px 8px -4px rgba(0,0,0,0.08);
    }
    100% {
      transform: translateY(0) scaleX(1.12) scaleY(0.88);
      box-shadow: 0 2px 12px -2px rgba(0,0,0,0.18);
    }
  }

  /* Accessibility: pause for reduced-motion preference */
  @media (prefers-reduced-motion: reduce) {
    .ea-progress-fill,
    .ea-ball-fallback {
      animation-duration: 0s !important;
    }
  }
`;
