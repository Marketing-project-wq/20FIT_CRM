"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/lang-provider";
import { LoadingBall, LoadingBallServer } from "@/components/shared/loading-ball";

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

  return <LoadingBall variant={variant} text={phases[phase]} />;
}

export function EventAnalysisLoaderServer() {
  return <LoadingBallServer />;
}
