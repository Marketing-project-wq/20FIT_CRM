"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/lang-provider";

const PHASE_INTERVAL_MS = 2400;

function RunningPerson({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className="ea-runner"
      aria-hidden
    >
      {/* Head */}
      <circle cx="32" cy="12" r="5" fill="var(--red)" />

      {/* Torso — slight forward lean */}
      <line
        x1="32" y1="17" x2="30" y2="34"
        stroke="var(--red)" strokeWidth="3" strokeLinecap="round"
      />

      {/* Left arm */}
      <g className="ea-arm-left" style={{ transformOrigin: "31px 20px" }}>
        <line
          x1="31" y1="20" x2="22" y2="30"
          stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"
        />
      </g>

      {/* Right arm */}
      <g className="ea-arm-right" style={{ transformOrigin: "31px 20px" }}>
        <line
          x1="31" y1="20" x2="40" y2="30"
          stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"
        />
      </g>

      {/* Left leg (upper + lower) */}
      <g className="ea-leg-left" style={{ transformOrigin: "30px 34px" }}>
        <line
          x1="30" y1="34" x2="22" y2="46"
          stroke="var(--red)" strokeWidth="3" strokeLinecap="round"
        />
        <line
          x1="22" y1="46" x2="18" y2="56"
          stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"
          className="ea-shin-left"
          style={{ transformOrigin: "22px 46px" }}
        />
      </g>

      {/* Right leg (upper + lower) */}
      <g className="ea-leg-right" style={{ transformOrigin: "30px 34px" }}>
        <line
          x1="30" y1="34" x2="38" y2="46"
          stroke="var(--red)" strokeWidth="3" strokeLinecap="round"
        />
        <line
          x1="38" y1="46" x2="42" y2="56"
          stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"
          className="ea-shin-right"
          style={{ transformOrigin: "38px 46px" }}
        />
      </g>
    </svg>
  );
}

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
        <RunningPerson size={28} />
        <span className="ea-phase-text font-body text-[13px] font-semibold text-ink-soft">
          {phases[phase]}
        </span>
        <style>{sharedStyles}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5">
      <RunningPerson size={64} />

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
      <RunningPerson size={64} />

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
  /* Running cycle: legs and arms swing in opposition */
  .ea-leg-left  { animation: ea-leg-fwd 0.5s ease-in-out infinite alternate; }
  .ea-leg-right { animation: ea-leg-bwd 0.5s ease-in-out infinite alternate; }
  .ea-arm-left  { animation: ea-arm-bwd 0.5s ease-in-out infinite alternate; }
  .ea-arm-right { animation: ea-arm-fwd 0.5s ease-in-out infinite alternate; }

  .ea-shin-left  { animation: ea-shin-fwd 0.5s ease-in-out infinite alternate; }
  .ea-shin-right { animation: ea-shin-bwd 0.5s ease-in-out infinite alternate; }

  @keyframes ea-leg-fwd {
    0%   { transform: rotate(-30deg); }
    100% { transform: rotate(30deg); }
  }
  @keyframes ea-leg-bwd {
    0%   { transform: rotate(30deg); }
    100% { transform: rotate(-30deg); }
  }
  @keyframes ea-arm-fwd {
    0%   { transform: rotate(-25deg); }
    100% { transform: rotate(25deg); }
  }
  @keyframes ea-arm-bwd {
    0%   { transform: rotate(25deg); }
    100% { transform: rotate(-25deg); }
  }
  @keyframes ea-shin-fwd {
    0%   { transform: rotate(0deg); }
    50%  { transform: rotate(-20deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes ea-shin-bwd {
    0%   { transform: rotate(0deg); }
    50%  { transform: rotate(20deg); }
    100% { transform: rotate(0deg); }
  }

  /* Subtle bounce on the whole runner */
  .ea-runner {
    animation: ea-bounce 0.25s ease-in-out infinite alternate;
  }
  @keyframes ea-bounce {
    0%   { transform: translateY(1px); }
    100% { transform: translateY(-1px); }
  }

  /* Phase text fade */
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
    animation: ea-progress-slide 1.8s ease-in-out infinite;
  }
  @keyframes ea-progress-slide {
    0%   { transform: translateX(-100%); }
    50%  { transform: translateX(200%); }
    100% { transform: translateX(-100%); }
  }
`;
