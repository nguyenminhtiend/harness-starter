// modals.jsx — HITL Plan Approval Modal + Report View

/* ── HITL Modal ── */
const HitlModal = ({ open, plan, onApprove, onReject }) => {
  const [editedPlan, setEditedPlan] = React.useState(null);
  const [mode, setMode] = React.useState('view'); // 'view' | 'edit'

  React.useEffect(() => {
    if (plan) setEditedPlan(JSON.parse(JSON.stringify(plan)));
  }, [plan]);

  if (!open || !plan || !editedPlan) return null;

  const updateSubQ = (i, field, val) => {
    setEditedPlan((p) => {
      const n = JSON.parse(JSON.stringify(p));
      n.subquestions[i][field] = val;
      return n;
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'oklch(0% 0 0 / 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        style={{
          width: 620,
          maxWidth: '90vw',
          maxHeight: '82vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn var(--t-enter)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--s5)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s3)',
              marginBottom: 'var(--s2)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-md)',
                background: 'var(--phase-planner-subtle)',
                border: '1px solid var(--phase-planner-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--phase-planner)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M2 4h11M2 7.5h7M2 11h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <h3
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--text-primary)',
                  lineHeight: 'var(--leading-tight)',
                }}
              >
                Plan Approval Required
              </h3>
              <p
                style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 2 }}
              >
                Review the planner's proposed research structure before execution
              </p>
            </div>
          </div>
          <div
            style={{
              padding: 'var(--s3)',
              background: 'var(--bg-base)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                marginBottom: 'var(--s1)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                fontWeight: 'var(--weight-medium)',
              }}
            >
              Research Question
            </p>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {plan.query}
            </p>
          </div>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0 var(--s5)',
            gap: 0,
            flexShrink: 0,
          }}
        >
          {[
            { id: 'view', label: 'Preview' },
            { id: 'edit', label: 'Edit Plan' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              style={{
                padding: 'var(--s2) var(--s4)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: mode === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: mode === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color var(--t-fast)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {editedPlan.subquestions.map((sq, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-md)',
                  padding: 'var(--s3) var(--s4)',
                  display: 'flex',
                  gap: 'var(--s3)',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    flexShrink: 0,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}
                >
                  {mode === 'edit' ? (
                    <>
                      <input
                        value={sq.question}
                        onChange={(e) => updateSubQ(i, 'question', e.target.value)}
                        style={{
                          width: '100%',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--r-sm)',
                          padding: '4px 8px',
                          color: 'var(--text-primary)',
                          fontSize: 'var(--text-sm)',
                          fontFamily: 'var(--font-sans)',
                          outline: 'none',
                        }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)' }}>
                        {sq.queries.map((q, qi) => (
                          <input
                            key={qi}
                            value={q}
                            onChange={(e) => {
                              const nq = [...sq.queries];
                              nq[qi] = e.target.value;
                              updateSubQ(i, 'queries', nq);
                            }}
                            style={{
                              background: 'var(--bg-base)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--r-sm)',
                              padding: '3px 7px',
                              color: 'var(--text-secondary)',
                              fontSize: 'var(--text-xs)',
                              fontFamily: 'var(--font-mono)',
                              outline: 'none',
                              width: 'auto',
                              minWidth: 120,
                            }}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text-primary)',
                          lineHeight: 'var(--leading-normal)',
                        }}
                      >
                        {sq.question}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)' }}>
                        {sq.queries.map((q, qi) => (
                          <span
                            key={qi}
                            style={{
                              fontSize: 'var(--text-xs)',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--phase-researcher)',
                              background: 'var(--phase-researcher-subtle)',
                              border: '1px solid var(--phase-researcher-border)',
                              borderRadius: 'var(--r-full)',
                              padding: '2px 8px',
                            }}
                          >
                            {q}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--s3)',
            padding: 'var(--s4) var(--s5)',
            borderTop: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <Button variant="danger" size="md" onClick={onReject} style={{ marginRight: 'auto' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 2L9 9M9 2L2 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Reject
          </Button>
          {mode === 'edit' ? (
            <Button
              variant="secondary"
              size="md"
              onClick={() => onApprove(editedPlan)}
              style={{
                background: 'oklch(72% 0.14 55 / 0.15)',
                borderColor: 'oklch(72% 0.14 55 / 0.4)',
                color: 'var(--phase-factchecker)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path
                  d="M1.5 5.5L4.5 8.5L9.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Approve Edited Plan
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="md" onClick={() => setMode('edit')}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M1.5 9L7 3.5L9 5.5L3.5 11H1.5V9Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                Edit Plan
              </Button>
              <Button variant="success" size="md" onClick={() => onApprove(editedPlan)}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M1.5 5.5L4.5 8.5L9.5 2.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Report View ── */
const FAKE_REPORT = `# The Future of Quantum Computing in Cryptography

## Executive Summary

Quantum computing poses a fundamental threat to current public-key cryptography infrastructure. Within 10–15 years, sufficiently powerful quantum computers could break RSA-2048 and ECC encryption using Shor's algorithm. This report examines the threat timeline, NIST's post-quantum standardization progress, and migration strategies for enterprises.

---

## 1. The Cryptographic Threat Model

Current public-key systems rely on the computational hardness of integer factorization (RSA) and discrete logarithm (ECC) problems. Classical computers require exponential time; quantum computers running **Shor's algorithm** can solve these in polynomial time.

**Key estimates:**
- A cryptographically relevant quantum computer (CRQC) requires ~4,000 logical qubits
- Current best: ~1,000 physical qubits (IBM Condor, 2023), with ~1,000:1 physical-to-logical overhead
- Realistic timeline for CRQC: **2030–2040** per most expert assessments

> "Harvest now, decrypt later" attacks are already underway — adversaries collect encrypted traffic today to decrypt once quantum capability matures.

---

## 2. NIST Post-Quantum Standardization

NIST finalized its first three post-quantum cryptography (PQC) standards in August 2024:

| Standard | Algorithm | Basis | Use Case |
|----------|-----------|-------|----------|
| FIPS 203 | ML-KEM (Kyber) | Module lattice | Key encapsulation |
| FIPS 204 | ML-DSA (Dilithium) | Module lattice | Digital signatures |
| FIPS 205 | SLH-DSA (SPHINCS+) | Hash-based | Digital signatures |

CRYSTALS-Kyber offers the best performance profile for TLS key exchange, with key sizes ~1.5KB vs RSA's 512 bytes — a manageable overhead.

---

## 3. Migration Priorities

### Tier 1 — Critical (Migrate by 2026)
- Long-lived secrets (certificate authorities, HSMs)
- Government and defense communications
- Financial transaction signing keys

### Tier 2 — High (Migrate by 2028)
- TLS certificate infrastructure
- Secure messaging protocols
- Code signing pipelines

### Tier 3 — Standard (Migrate by 2030)
- Internal API authentication
- Employee VPN credentials

---

## 4. Conclusion

The migration to post-quantum cryptography is a **decade-long infrastructure project** that must begin now to meet the estimated threat window. Organizations should adopt a crypto-agile architecture, audit current key lifetimes, and begin hybrid classical/PQC deployments in 2025.

---

*Sources: NIST IR 8413 (2022), NIST FIPS 203/204/205 (2024), IBM Quantum Roadmap (2023), NSA CNSA 2.0 Advisory (2022)*
`;

const ReportView = ({ report, query, onBack, runId }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(report || FAKE_REPORT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([report || FAKE_REPORT], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple markdown renderer (no react-markdown available in prototype)
  const renderMd = (md) => {
    return md
      .replace(
        /^# (.+)$/gm,
        '<h1 style="font-size:var(--text-3xl);font-weight:var(--weight-semibold);color:var(--text-primary);margin:0 0 var(--s4);letter-spacing:var(--tracking-tight)">$1</h1>',
      )
      .replace(
        /^## (.+)$/gm,
        '<h2 style="font-size:var(--text-xl);font-weight:var(--weight-semibold);color:var(--text-primary);margin:var(--s8) 0 var(--s3);padding-top:var(--s6);border-top:1px solid var(--border-subtle)">$1</h2>',
      )
      .replace(
        /^### (.+)$/gm,
        '<h3 style="font-size:var(--text-md);font-weight:var(--weight-semibold);color:var(--text-secondary);margin:var(--s5) 0 var(--s2)">$1</h3>',
      )
      .replace(
        /\*\*(.+?)\*\*/g,
        '<strong style="color:var(--text-primary);font-weight:var(--weight-semibold)">$1</strong>',
      )
      .replace(
        /`(.+?)`/g,
        '<code style="font-family:var(--font-mono);font-size:0.88em;background:var(--bg-elevated);padding:1px 5px;border-radius:var(--r-xs);border:1px solid var(--border-subtle);color:var(--phase-researcher)">$1</code>',
      )
      .replace(
        /^> (.+)$/gm,
        '<blockquote style="border-left:3px solid var(--accent);padding-left:var(--s4);margin:var(--s4) 0;color:var(--text-secondary);font-style:italic">$1</blockquote>',
      )
      .replace(
        /^---$/gm,
        '<hr style="border:none;border-top:1px solid var(--border-subtle);margin:var(--s6) 0"/>',
      )
      .replace(/^\| (.+) \|$/gm, (m, row) => {
        if (row.match(/^[\s\-|]+$/)) return '';
        const cells = row.split(' | ');
        return `<tr>${cells.map((c) => `<td style="padding:var(--s2) var(--s3);border-bottom:1px solid var(--border-subtle);font-size:var(--text-sm);color:var(--text-secondary)">${c}</td>`).join('')}</tr>`;
      })
      .replace(
        /(<tr>.*<\/tr>\n?)+/gs,
        (m) =>
          `<table style="width:100%;border-collapse:collapse;border:1px solid var(--border-subtle);border-radius:var(--r-md);overflow:hidden;margin:var(--s4) 0">${m}</table>`,
      )
      .replace(
        /^- (.+)$/gm,
        '<li style="color:var(--text-secondary);font-size:var(--text-md);margin-bottom:var(--s1)">$1</li>',
      )
      .replace(
        /(<li>.*<\/li>\n?)+/gs,
        (m) =>
          `<ul style="padding-left:var(--s5);margin:var(--s3) 0;display:flex;flex-direction:column;gap:2px">${m}</ul>`,
      )
      .replace(
        /\n\n/g,
        '</p><p style="color:var(--text-secondary);font-size:var(--text-md);line-height:var(--leading-loose);margin:var(--s3) 0">',
      )
      .replace(
        /^\*Sources:(.+)\*$/gm,
        '<p style="font-size:var(--text-xs);color:var(--text-tertiary);font-family:var(--font-mono);border-top:1px solid var(--border-subtle);padding-top:var(--s4);margin-top:var(--s8)">Sources: $1</p>',
      );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Report toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s3)',
          padding: '0 var(--s5)',
          borderBottom: '1px solid var(--border-subtle)',
          height: 'var(--header-h)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
            padding: 0,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M8 2L4 6L8 10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <div style={{ flex: 1 }} />
        <Badge variant="success">Report</Badge>
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy MD'}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleDownload}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.5 1v7M3 6l2.5 2.5L8 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M1 10h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Download
        </Button>
      </div>
      {/* Report body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s10) var(--s12)' }}>
        <div
          style={{ maxWidth: 760, margin: '0 auto' }}
          dangerouslySetInnerHTML={{ __html: renderMd(report || FAKE_REPORT) }}
        />
      </div>
    </div>
  );
};

Object.assign(window, { HitlModal, ReportView, FAKE_REPORT });
