import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Subquestion } from '../../shared/plan.ts';
import { ResearchPlan as ResearchPlanSchema } from '../../shared/plan.ts';
import { Button, Input, Modal, Textarea } from './primitives.tsx';

export interface PlanApprovalModalProps {
  open: boolean;
  plan: unknown;
  onApprove: (plan: unknown) => void | Promise<void>;
  onReject: () => void | Promise<void>;
}

function cloneSubquestions(sqs: Subquestion[]): Subquestion[] {
  return sqs.map((s) => ({
    id: s.id,
    question: s.question,
    searchQueries: [...s.searchQueries],
  }));
}

export function PlanApprovalModal({ open, plan, onApprove, onReject }: PlanApprovalModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftSubquestions, setDraftSubquestions] = useState<Subquestion[]>([]);
  const frozenPlanRef = useRef<unknown>(null);

  const parsedPlan = useMemo(() => {
    if (!open) {
      return { success: false as const };
    }
    return ResearchPlanSchema.safeParse(plan);
  }, [open, plan]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      return;
    }

    frozenPlanRef.current = plan;
    if (parsedPlan.success) {
      setDraftSubquestions(cloneSubquestions(parsedPlan.data.subquestions));
    } else {
      setDraftSubquestions([]);
    }
  }, [open, plan, parsedPlan]);

  const handleReject = useCallback(async () => {
    await onReject();
  }, [onReject]);

  const handleApproveAsIs = useCallback(async () => {
    await onApprove(frozenPlanRef.current);
  }, [onApprove]);

  const handleEditAndApprove = useCallback(async () => {
    const base = ResearchPlanSchema.safeParse(frozenPlanRef.current);
    if (!base.success) {
      return;
    }
    const edited = {
      question: base.data.question,
      subquestions: draftSubquestions.map((s) => ({
        id: s.id,
        question: s.question,
        searchQueries: s.searchQueries ?? [],
      })),
    };
    const validated = ResearchPlanSchema.safeParse(edited);
    if (!validated.success) {
      return;
    }
    await onApprove(validated.data);
  }, [draftSubquestions, onApprove]);

  const updateSubquestion = (index: number, patch: Partial<Subquestion>) => {
    setDraftSubquestions((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) {
        return prev;
      }
      next[index] = { ...cur, ...patch };
      return next;
    });
  };

  const questionLabel = parsedPlan.success ? parsedPlan.data.question : 'Plan (unstructured)';

  return (
    <Modal
      open={open}
      onClose={() => {
        void handleReject();
      }}
      title="Review research plan"
      width={640}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
        <div>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              marginBottom: 'var(--s2)',
            }}
          >
            Question
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', margin: 0 }}>
            {questionLabel}
          </p>
        </div>

        <div>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              marginBottom: 'var(--s2)',
            }}
          >
            Subquestions
          </div>
          {!parsedPlan.success ? (
            <pre
              style={{
                margin: 0,
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(plan, null, 2)}
            </pre>
          ) : !isEditing ? (
            <ul
              style={{
                margin: 0,
                paddingLeft: 'var(--s5)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                lineHeight: 'var(--leading-relaxed)',
              }}
            >
              {parsedPlan.data.subquestions.map((s) => (
                <li key={s.id} style={{ marginBottom: 'var(--s2)' }}>
                  <span style={{ fontWeight: 'var(--weight-medium)' }}>{s.id}:</span> {s.question}
                  {s.searchQueries.length > 0 && (
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-tertiary)',
                        marginTop: 4,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {s.searchQueries.join(' · ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              {draftSubquestions.map((s, i) => (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                    padding: 'var(--s3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--s2)',
                  }}
                >
                  <Input
                    label="Subquestion"
                    value={s.question}
                    onChange={(e) => {
                      updateSubquestion(i, { question: e.target.value });
                    }}
                  />
                  <Textarea
                    label="Search queries (one per line)"
                    rows={3}
                    value={s.searchQueries.join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0);
                      updateSubquestion(i, { searchQueries: lines });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s2)',
            justifyContent: 'flex-end',
            paddingTop: 'var(--s2)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <Button variant="ghost" size="md" onClick={() => setIsEditing((v) => !v)}>
            {isEditing ? 'Done editing' : 'Edit'}
          </Button>
          <Button variant="danger" size="md" onClick={() => void handleReject()}>
            Reject
          </Button>
          <Button variant="secondary" size="md" onClick={() => void handleApproveAsIs()}>
            Approve
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!isEditing || !parsedPlan.success}
            onClick={() => void handleEditAndApprove()}
          >
            Edit and approve
          </Button>
        </div>
      </div>
    </Modal>
  );
}
