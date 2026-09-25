export const verificationQuestions = {
  plausible: {
    type: "noul",
    instructions: "Is the candidate issue technically supported by the supplied code and repository evidence?",
    criteria: { true: "The described failure mechanism is coherent and supported", false: "The detector is incidental, contradicted, or lacks necessary evidence" },
  },
  reachable: {
    type: "noul",
    instructions: "Can the problematic state realistically occur in production or a credible edge case?",
    criteria: { true: "A realistic input, state, deployment, or concurrency scenario can reach it", false: "The state is effectively impossible from the visible context" },
  },
  severe: {
    type: "score",
    instructions: "How significant is the practical impact if this issue occurs?",
    criteria: ["negligible", "low", "moderate", "high", "critical"],
  },
  protected: {
    type: "noul",
    instructions: "Does the visible repository context contain a concrete protection that neutralizes this issue?",
    criteria: { true: "A transaction, lock, uniqueness constraint, authorization rule, validation, escaping, idempotency mechanism, bound, or equivalent protection neutralizes it", false: "No adequate neutralizing protection is visible" },
  },
  report: {
    type: "noul",
    instructions: "Should a careful professional code reviewer surface this finding, balancing usefulness against false-positive noise?",
    criteria: { true: "The issue is actionable and worth interrupting the author", false: "It is too speculative, cosmetic, or already neutralized" },
  },
};

export const IMPACT_LABELS = { negligible: 0.05, low: 0.25, moderate: 0.5, high: 0.78, critical: 1 };
