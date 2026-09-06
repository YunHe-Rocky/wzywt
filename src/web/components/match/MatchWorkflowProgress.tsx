const STEPS = ["建档", "上传", "识别", "确认", "提交"] as const;

function currentStep(status: string, screenshotCount: number, recognitionStatus?: string): number {
  if (status === "SUBMITTED" || status === "CONFIRMED") return 5;
  if (status === "WAITING_CONFIRMATION" || recognitionStatus === "COMPLETED") return 4;
  if (screenshotCount === 6) return 3;
  return 2;
}

export function MatchWorkflowProgress({ status, screenshotCount, recognitionStatus }: { status: string; screenshotCount: number; recognitionStatus?: string }) {
  const active = currentStep(status, screenshotCount, recognitionStatus);
  return (
    <nav className="match-workflow" aria-label="比赛档案进度">
      <span className="match-workflow-label">档案进度</span>
      <ol>
        {STEPS.map((label, index) => {
          const step = index + 1;
          const submitted = status === "SUBMITTED";
          const complete = submitted || step < active;
          const current = !submitted && step === active;
          return (
            <li key={label} aria-current={current ? "step" : undefined} data-state={current ? "current" : complete ? "complete" : "pending"}>
              <span className="match-workflow-dot" aria-hidden="true">{complete ? "✓" : step}</span>
              <span className="match-workflow-step">{label}</span>
              <span className="sr-only">{current ? "当前下一步" : complete ? "已完成" : "未开始"}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
