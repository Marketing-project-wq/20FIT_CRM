"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/lang-provider";

const PHASE_INTERVAL_MS = 2400;
const ICON_COUNT = 5;

interface IconProps { className?: string; style?: React.CSSProperties }

function RunnerIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="14" cy="4" r="2" />
      <path d="M6 20l3-7 2.5 1V8l3 3 4-1" />
      <path d="M9 13l-3 7" />
      <path d="M17 10l2 5h3" />
    </svg>
  );
}

function DumbbellIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11M6.5 17.5h11" />
      <rect x="2" y="6.5" width="4.5" height="11" rx="1" />
      <rect x="17.5" y="6.5" width="4.5" height="11" rx="1" />
      <path d="M12 6.5v11" />
    </svg>
  );
}

function BicycleIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h3" />
    </svg>
  );
}

function MedalIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.21 15L2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
      <path d="M11 12L5.12 2.2" />
      <path d="M13 12l5.88-9.8" />
      <circle cx="12" cy="17" r="5" />
      <path d="M12 14v4" />
      <path d="M10 16h4" />
    </svg>
  );
}

function TimerIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M10 2h4" />
      <path d="M12 2v2" />
      <path d="M20 5l-1.5 1.5" />
    </svg>
  );
}

const ICONS = [RunnerIcon, DumbbellIcon, BicycleIcon, MedalIcon, TimerIcon];

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
      <div className="ea-loader-inline flex items-center justify-center gap-3 py-8">
        <div className="ea-icon-ring">
          {ICONS.map((Icon, i) => (
            <Icon
              key={i}
              className="ea-ring-icon"
              aria-hidden
            />
          ))}
        </div>
        <span className="ea-phase-text font-body text-[13px] font-semibold text-ink-soft">
          {phases[phase]}
        </span>
        <style>{inlineStyles}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6">
      <div className="ea-icon-stage" aria-hidden>
        {ICONS.map((Icon, i) => (
          <Icon
            key={i}
            className="ea-stage-icon"
            style={{ animationDelay: `${i * (PHASE_INTERVAL_MS / ICON_COUNT)}ms` }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="ea-phase-text font-display text-[15px] font-bold text-ink" key={phase}>
          {phases[phase]}
        </span>
        <div className="ea-progress-track">
          <div className="ea-progress-fill" />
        </div>
      </div>

      <style>{fullStyles}</style>
    </div>
  );
}

export function EventAnalysisLoaderServer() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6">
      <div className="ea-icon-stage" aria-hidden>
        {ICONS.map((Icon, i) => (
          <Icon
            key={i}
            className="ea-stage-icon"
            style={{ animationDelay: `${i * (PHASE_INTERVAL_MS / ICON_COUNT)}ms` }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="ea-phase-text font-display text-[15px] font-bold text-ink">
          Loading...
        </span>
        <div className="ea-progress-track">
          <div className="ea-progress-fill" />
        </div>
      </div>

      <style>{fullStyles}</style>
    </div>
  );
}

const fullStyles = `
  .ea-icon-stage {
    position: relative;
    width: 3.5rem;
    height: 3.5rem;
  }
  .ea-stage-icon {
    position: absolute;
    inset: 0;
    width: 3.5rem;
    height: 3.5rem;
    color: var(--red);
    opacity: 0;
    animation: ea-icon-cycle ${PHASE_INTERVAL_MS}ms ease-in-out infinite;
  }
  @keyframes ea-icon-cycle {
    0%, 100% { opacity: 0; transform: scale(0.7) translateY(4px); }
    15%, 75% { opacity: 1; transform: scale(1) translateY(0); }
    90% { opacity: 0; transform: scale(0.7) translateY(-4px); }
  }
  .ea-phase-text {
    animation: ea-fade-in 400ms ease-out;
  }
  @keyframes ea-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
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
    0% { transform: translateX(-100%); }
    50% { transform: translateX(200%); }
    100% { transform: translateX(-100%); }
  }
`;

const inlineStyles = `
  .ea-icon-ring {
    position: relative;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }
  .ea-ring-icon {
    position: absolute;
    inset: 0;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--red);
    opacity: 0;
    animation: ea-icon-cycle ${PHASE_INTERVAL_MS}ms ease-in-out infinite;
  }
  .ea-ring-icon:nth-child(1) { animation-delay: 0ms; }
  .ea-ring-icon:nth-child(2) { animation-delay: ${PHASE_INTERVAL_MS / ICON_COUNT}ms; }
  .ea-ring-icon:nth-child(3) { animation-delay: ${(PHASE_INTERVAL_MS / ICON_COUNT) * 2}ms; }
  .ea-ring-icon:nth-child(4) { animation-delay: ${(PHASE_INTERVAL_MS / ICON_COUNT) * 3}ms; }
  .ea-ring-icon:nth-child(5) { animation-delay: ${(PHASE_INTERVAL_MS / ICON_COUNT) * 4}ms; }
  @keyframes ea-icon-cycle {
    0%, 100% { opacity: 0; transform: scale(0.7) translateY(4px); }
    15%, 75% { opacity: 1; transform: scale(1) translateY(0); }
    90% { opacity: 0; transform: scale(0.7) translateY(-4px); }
  }
  .ea-loader-inline .ea-phase-text {
    animation: ea-fade-in 400ms ease-out;
  }
  @keyframes ea-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
