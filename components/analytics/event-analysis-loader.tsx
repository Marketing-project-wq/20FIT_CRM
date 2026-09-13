"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/lang-provider";

const PHASE_INTERVAL_MS = 2400;

function RunningPerson({ size = 80 }: { size?: number }) {
  const h = Math.round(size * 1.15);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 80 92"
      className="ea-runner"
      aria-hidden
    >
      {/* Ground shadow */}
      <ellipse
        cx="40" cy="89" rx="14" ry="2.5"
        fill="var(--red)" opacity="0.15"
        className="ea-shadow"
        style={{ transformOrigin: "40px 89px" }}
      />

      {/* Body group — 5° forward lean */}
      <g transform="rotate(5, 40, 44)">
        {/* Back leg (depth layer — lower opacity) */}
        <g className="ea-thigh-b" style={{ transformOrigin: "40px 44px" }}>
          <rect x="36.5" y="44" width="7" height="20" rx="3.5" fill="var(--red)" opacity="0.6" />
          <g className="ea-shin-b" style={{ transformOrigin: "40px 62px" }}>
            <rect x="37" y="61" width="6" height="18" rx="3" fill="var(--red)" opacity="0.55" />
          </g>
        </g>

        {/* Back arm (depth layer) */}
        <g className="ea-arm-b" style={{ transformOrigin: "40px 22px" }}>
          <rect x="37.75" y="22" width="4.5" height="14" rx="2.25" fill="var(--red)" opacity="0.6" />
          <g className="ea-forearm-b" style={{ transformOrigin: "40px 35px" }}>
            <rect x="38" y="34" width="4" height="12" rx="2" fill="var(--red)" opacity="0.55" />
          </g>
        </g>

        {/* Torso */}
        <rect x="33.5" y="19" width="13" height="27" rx="5" fill="var(--red)" />

        {/* Head */}
        <circle cx="40" cy="13" r="6" fill="var(--red)" />

        {/* Front leg */}
        <g className="ea-thigh-f" style={{ transformOrigin: "40px 44px" }}>
          <rect x="36.5" y="44" width="7" height="20" rx="3.5" fill="var(--red)" />
          <g className="ea-shin-f" style={{ transformOrigin: "40px 62px" }}>
            <rect x="37" y="61" width="6" height="18" rx="3" fill="var(--red)" />
          </g>
        </g>

        {/* Front arm */}
        <g className="ea-arm-f" style={{ transformOrigin: "40px 22px" }}>
          <rect x="37.75" y="22" width="4.5" height="14" rx="2.25" fill="var(--red)" />
          <g className="ea-forearm-f" style={{ transformOrigin: "40px 35px" }}>
            <rect x="38" y="34" width="4" height="12" rx="2" fill="var(--red)" />
          </g>
        </g>
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
        <RunningPerson size={32} />
        <span className="ea-phase-text font-body text-[13px] font-semibold text-ink-soft">
          {phases[phase]}
        </span>
        <style>{sharedStyles}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5">
      <RunningPerson size={80} />

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
      <RunningPerson size={80} />

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
  /* ── Stride cycle: 0.6s, 8-keyframe sinusoidal ── */

  .ea-thigh-f { animation: ea-leg 0.6s cubic-bezier(0.37,0,0.63,1) infinite; }
  .ea-thigh-b { animation: ea-leg 0.6s cubic-bezier(0.37,0,0.63,1) -0.3s infinite; }

  @keyframes ea-leg {
    0%      { transform: rotate(-28deg); }
    12.5%   { transform: rotate(-15deg); }
    25%     { transform: rotate(4deg); }
    37.5%   { transform: rotate(20deg); }
    50%     { transform: rotate(28deg); }
    62.5%   { transform: rotate(15deg); }
    75%     { transform: rotate(-4deg); }
    87.5%   { transform: rotate(-20deg); }
    100%    { transform: rotate(-28deg); }
  }

  /* Knee bend: folds during swing, straight during stance */
  .ea-shin-f { animation: ea-knee 0.6s cubic-bezier(0.37,0,0.63,1) infinite; }
  .ea-shin-b { animation: ea-knee 0.6s cubic-bezier(0.37,0,0.63,1) -0.3s infinite; }

  @keyframes ea-knee {
    0%      { transform: rotate(0deg); }
    12.5%   { transform: rotate(5deg); }
    25%     { transform: rotate(3deg); }
    37.5%   { transform: rotate(0deg); }
    50%     { transform: rotate(10deg); }
    62.5%   { transform: rotate(35deg); }
    75%     { transform: rotate(25deg); }
    87.5%   { transform: rotate(8deg); }
    100%    { transform: rotate(0deg); }
  }

  /* Arm swing: contralateral to legs, smaller amplitude */
  .ea-arm-f { animation: ea-arm 0.6s cubic-bezier(0.37,0,0.63,1) infinite; }
  .ea-arm-b { animation: ea-arm 0.6s cubic-bezier(0.37,0,0.63,1) -0.3s infinite; }

  @keyframes ea-arm {
    0%      { transform: rotate(-22deg); }
    12.5%   { transform: rotate(-12deg); }
    25%     { transform: rotate(3deg); }
    37.5%   { transform: rotate(15deg); }
    50%     { transform: rotate(22deg); }
    62.5%   { transform: rotate(12deg); }
    75%     { transform: rotate(-3deg); }
    87.5%   { transform: rotate(-15deg); }
    100%    { transform: rotate(-22deg); }
  }

  /* Elbow: subtle oscillation around ~30° bend */
  .ea-forearm-f { animation: ea-elbow 0.6s cubic-bezier(0.37,0,0.63,1) infinite; }
  .ea-forearm-b { animation: ea-elbow 0.6s cubic-bezier(0.37,0,0.63,1) -0.3s infinite; }

  @keyframes ea-elbow {
    0%      { transform: rotate(-30deg); }
    25%     { transform: rotate(-38deg); }
    50%     { transform: rotate(-30deg); }
    75%     { transform: rotate(-22deg); }
    100%    { transform: rotate(-30deg); }
  }

  /* Body vertical bounce (2× stride frequency) */
  .ea-runner {
    animation: ea-bounce 0.3s cubic-bezier(0.37,0,0.63,1) infinite alternate;
  }
  @keyframes ea-bounce {
    from { transform: translateY(1px); }
    to   { transform: translateY(-1.5px); }
  }

  /* Ground shadow pulses with stride */
  .ea-shadow {
    animation: ea-shadow 0.3s ease-in-out infinite alternate;
  }
  @keyframes ea-shadow {
    from { transform: scaleX(0.85); opacity: 0.12; }
    to   { transform: scaleX(1.15); opacity: 0.22; }
  }

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

  /* Accessibility: pause for reduced-motion preference */
  @media (prefers-reduced-motion: reduce) {
    .ea-runner, .ea-shadow, .ea-progress-fill,
    .ea-thigh-f, .ea-thigh-b,
    .ea-shin-f, .ea-shin-b,
    .ea-arm-f, .ea-arm-b,
    .ea-forearm-f, .ea-forearm-b {
      animation-duration: 0s !important;
    }
  }
`;
