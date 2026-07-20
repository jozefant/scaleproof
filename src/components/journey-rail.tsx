type JourneyState = "intake" | "scanning" | "report";

const STEPS = ["Repository", "Evidence", "Three actions"] as const;

export function JourneyRail({ state }: { state: JourneyState }) {
  const activeIndex = state === "intake" ? 0 : state === "scanning" ? 1 : 2;

  return (
    <ol className="journey-rail" aria-label="Scaleproof journey">
      {STEPS.map((step, index) => {
        const status = index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
        return (
          <li key={step} className={`journey-step ${status}`}>
            <span aria-hidden="true">{index + 1}</span>
            <strong aria-current={status === "current" ? "step" : undefined}>{step}</strong>
          </li>
        );
      })}
    </ol>
  );
}
