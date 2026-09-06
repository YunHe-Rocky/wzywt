interface Explanation {
  algorithmVersion: string;
  policy: string;
  caveat: string;
  unknownStrengthCount: number;
  unknownStrengthRatio: number;
}

interface Summary {
  redStrength: number;
  blueStrength: number;
  maxLaneStrengthDiff: number;
}

export function SplitExplanation({ explanation, summary }: { explanation?: Explanation; summary?: Summary }) {
  if (!explanation || !summary) return null;
  return (
    <section className="card !mt-4 !p-5" aria-labelledby="split-explanation-title">
      <h4 id="split-explanation-title" className="text-base font-semibold text-text">为什么这样分</h4>
      <p className="mt-2 text-sm text-text-secondary">{explanation.policy}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div><dt className="text-text-muted">红方估计强度</dt><dd className="font-semibold text-text">{Math.round(summary.redStrength)}</dd></div>
        <div><dt className="text-text-muted">蓝方估计强度</dt><dd className="font-semibold text-text">{Math.round(summary.blueStrength)}</dd></div>
        <div><dt className="text-text-muted">最悬殊分路</dt><dd className="font-semibold text-text">{Math.round(summary.maxLaneStrengthDiff)}</dd></div>
        <div><dt className="text-text-muted">未知强度资料</dt><dd className="font-semibold text-text">{explanation.unknownStrengthCount}/10（{Math.round(explanation.unknownStrengthRatio * 100)}%）</dd></div>
      </dl>
      <p className="mt-3 text-xs text-text-muted">算法 {explanation.algorithmVersion}。{explanation.caveat}</p>
    </section>
  );
}