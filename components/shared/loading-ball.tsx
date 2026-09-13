"use client";

import { Lottie } from "lottie-react";
import redBallData from "./red-ball-lottie.json";

interface LoadingBallProps {
  variant?: "full" | "inline";
  text?: string;
}

export function LoadingBall({ variant = "full", text }: LoadingBallProps) {
  if (variant === "inline") {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        <Lottie src={redBallData} loop autoplay style={{ width: 32, height: 32 }} aria-hidden />
        {text && (
          <span className="lb-phase-text font-body text-[13px] font-semibold text-ink-soft">
            {text}
          </span>
        )}
        <style>{ballStyles}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5">
      <Lottie src={redBallData} loop autoplay style={{ width: 80, height: 80 }} aria-hidden />

      <div className="flex flex-col items-center gap-2.5">
        {text && (
          <span className="lb-phase-text font-display text-[15px] font-bold text-ink">
            {text}
          </span>
        )}
        <div className="lb-progress-track">
          <div className="lb-progress-fill" />
        </div>
      </div>

      <style>{ballStyles}</style>
    </div>
  );
}

export function LoadingBallServer({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5">
      <div className="lb-ball-fallback" aria-hidden />

      <div className="flex flex-col items-center gap-2.5">
        <span className="lb-phase-text font-display text-[15px] font-bold text-ink">
          {text}
        </span>
        <div className="lb-progress-track">
          <div className="lb-progress-fill" />
        </div>
      </div>

      <style>{ballStyles}</style>
    </div>
  );
}

const ballStyles = `
  .lb-phase-text {
    animation: lb-fade-in 400ms ease-out;
  }
  @keyframes lb-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .lb-progress-track {
    width: 12rem;
    height: 3px;
    border-radius: 2px;
    background: var(--surface-border);
    overflow: hidden;
  }
  .lb-progress-fill {
    width: 40%;
    height: 100%;
    border-radius: 2px;
    background: var(--red);
    animation: lb-slide 1.8s ease-in-out infinite;
  }
  @keyframes lb-slide {
    0%   { transform: translateX(-100%); }
    50%  { transform: translateX(200%); }
    100% { transform: translateX(-100%); }
  }

  .lb-ball-fallback {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.25), transparent 50%), var(--red);
    animation: lb-ball-bounce 1s cubic-bezier(0.12, 0, 0.39, 0) infinite alternate;
    box-shadow: 0 0 0 rgba(0,0,0,0);
  }
  @keyframes lb-ball-bounce {
    0% {
      transform: translateY(-24px) scaleX(1) scaleY(1);
      box-shadow: 0 24px 8px -4px rgba(0,0,0,0.08);
    }
    100% {
      transform: translateY(0) scaleX(1.12) scaleY(0.88);
      box-shadow: 0 2px 12px -2px rgba(0,0,0,0.18);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lb-progress-fill,
    .lb-ball-fallback {
      animation-duration: 0s !important;
    }
  }
`;
