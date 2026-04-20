// App.jsx — Main layout, state orchestration, stream simulation

const FAKE_HISTORY = [
  {
    id: 'run_8f3a2b',
    tool: 'deep-research',
    query:
      'What are the security implications of quantum computing for current cryptographic infrastructure?',
    status: 'completed',
    cost: 2.847,
    ts: Date.now() - 3600000,
  },
  {
    id: 'run_1c9d4e',
    tool: 'deep-research',
    query:
      'Compare transformer vs. state space model architectures for long-context document processing',
    status: 'completed',
    cost: 4.112,
    ts: Date.now() - 86400000,
  },
  {
    id: 'run_5e7f8a',
    tool: 'deep-research',
    query: 'Best practices for multi-tenant SaaS database architecture in 2025',
    status: 'failed',
    cost: 0.341,
    ts: Date.now() - 172800000,
  },
  {
    id: 'run_2b6c9f',
    tool: 'deep-research',
    query: 'Overview of WASM component model and its implications for plugin architectures',
    status: 'cancelled',
    cost: 0.089,
    ts: Date.now() - 259200000,
  },
];

const FAKE_PLAN = {
  query: '',
  subquestions: [
    {
      question: 'What quantum algorithms pose the greatest threat to RSA and ECC encryption?',
      queries: ["Shor's algorithm RSA attack", 'quantum factoring ECC timeline'],
    },
    {
      question: 'What is the current state of NIST post-quantum cryptography standardization?',
      queries: ['NIST PQC standards 2024', 'CRYSTALS-Kyber FIPS 203'],
    },
    {
      question: 'How are major cloud providers preparing their infrastructure for quantum threats?',
      queries: ['AWS quantum-safe TLS', 'Google post-quantum migration 2024'],
    },
    {
      question:
        'What enterprise migration strategies exist for transitioning to post-quantum algorithms?',
      queries: ['crypto agility enterprise strategy', 'hybrid classical quantum TLS'],
    },
  ],
};

const genId = () => 'run_' + Math.random().toString(36).slice(2, 8);
const evId = () => Math.random().toString(36).slice(2, 9);

const STREAM_SCRIPT = [
  {
    delay: 400,
    phase: 'planner',
    content: 'Analyzing research question and identifying key knowledge gaps…',
    streaming: true,
  },
  {
    delay: 300,
    phase: 'agent',
    content: 'Planner agent initialised',
    subLabel: 'agent:start',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 1100,
    phase: 'planner',
    content:
      'Decomposing into 4 sub-questions spanning threat timeline, standardization, infrastructure readiness, and migration strategy.',
    subLabel: 'plan generated',
    tokDelta: 1240,
    costDelta: 0.018,
  },
  {
    delay: 180,
    phase: 'metric',
    content: 'Planner completed in 1.7 s · 1,240 tokens · $0.018',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  // HITL gate inserted here if enabled
  {
    delay: 200,
    phase: 'agent',
    content: 'Researcher agent 1 spawned (lane 1)',
    subLabel: 'agent:start',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 150,
    phase: 'agent',
    content: 'Researcher agent 2 spawned (lane 2)',
    subLabel: 'agent:start',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 600,
    phase: 'tool',
    content: 'web_search({ query: "Shor\'s algorithm RSA factoring complexity", max_results: 5 })',
    subLabel: 'tool:call',
    laneId: 1,
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
    payload:
      '{"tool":"web_search","args":{"query":"Shor\'s algorithm RSA factoring complexity","max_results":5}}',
  },
  {
    delay: 100,
    phase: 'researcher',
    content: 'Searching: "Shor\'s algorithm RSA factoring complexity"',
    subLabel: 'web_search',
    laneId: 1,
    tokDelta: 820,
    costDelta: 0.011,
    payload: '{"query":"Shor\'s algorithm RSA factoring complexity","results":3}',
  },
  {
    delay: 450,
    phase: 'tool',
    content: 'web_search → 3 results, top: "Quantum advantage in factoring integers — Nature 2024"',
    subLabel: 'tool:result',
    laneId: 1,
    verboseOnly: true,
    tokDelta: 640,
    costDelta: 0.009,
    payload:
      '{"results":[{"title":"Quantum advantage in factoring integers","source":"nature.com","snippet":"RSA-2048 remains secure until ~4,096 logical qubits are available..."}]}',
  },
  {
    delay: 100,
    phase: 'tool',
    content:
      'web_search({ query: "NIST post-quantum cryptography finalized standards 2024", max_results: 5 })',
    subLabel: 'tool:call',
    laneId: 2,
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
    payload: '{"tool":"web_search","args":{"query":"NIST PQC standards 2024","max_results":5}}',
  },
  {
    delay: 700,
    phase: 'researcher',
    content: 'Searching: "NIST post-quantum cryptography finalized standards 2024"',
    subLabel: 'web_search',
    laneId: 2,
    tokDelta: 890,
    costDelta: 0.013,
    payload: '{"query":"NIST PQC standards 2024","results":5}',
  },
  {
    delay: 400,
    phase: 'tool',
    content:
      'web_search → 5 results, top: "NIST Releases First 3 Finalized Post-Quantum Encryption Standards — NIST.gov"',
    subLabel: 'tool:result',
    laneId: 2,
    verboseOnly: true,
    tokDelta: 720,
    costDelta: 0.01,
  },
  {
    delay: 900,
    phase: 'researcher',
    content:
      'Found: NIST FIPS 203/204/205 finalized August 2024. ML-KEM (Kyber), ML-DSA (Dilithium), SLH-DSA (SPHINCS+) standardized.',
    laneId: 2,
    tokDelta: 540,
    costDelta: 0.008,
  },
  {
    delay: 800,
    phase: 'researcher',
    content:
      'Found: Cryptographically-relevant quantum computer estimated at ~4,000 logical qubits. Current record: ~1,000 physical qubits.',
    laneId: 1,
    tokDelta: 490,
    costDelta: 0.007,
  },
  {
    delay: 150,
    phase: 'agent',
    content: 'Researcher agent 3 spawned (lane 3)',
    subLabel: 'agent:start',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 700,
    phase: 'researcher',
    content: 'Searching: "enterprise post-quantum migration strategy crypto agility"',
    subLabel: 'web_search',
    laneId: 3,
    tokDelta: 760,
    costDelta: 0.011,
    payload: '{"query":"enterprise post-quantum migration strategy","results":4}',
  },
  {
    delay: 1200,
    phase: 'researcher',
    content:
      'Synthesizing 14 sources across sub-questions 1–3. Identified consensus on 2030–2040 CRQC timeline.',
    subLabel: 'synthesis',
    laneId: 1,
    tokDelta: 1840,
    costDelta: 0.026,
  },
  {
    delay: 200,
    phase: 'metric',
    content: 'Researchers: 14 sources · 6,700 tokens · $0.095 · avg 2.1 s/query',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 900,
    phase: 'researcher',
    content: 'Searching: "harvest now decrypt later quantum threat nation state"',
    subLabel: 'web_search',
    laneId: 4,
    tokDelta: 610,
    costDelta: 0.009,
    payload: '{"query":"harvest now decrypt later HNDL quantum","results":3}',
  },
  {
    delay: 1100,
    phase: 'researcher',
    content:
      'All sub-questions researched. 22 sources collected, 6 high-confidence citations identified.',
    subLabel: 'complete',
    tokDelta: 920,
    costDelta: 0.013,
  },
  {
    delay: 200,
    phase: 'agent',
    content: 'Researcher agents 1–4 terminated',
    subLabel: 'agent:stop',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 150,
    phase: 'agent',
    content: 'Writer agent initialised',
    subLabel: 'agent:start',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 600,
    phase: 'writer',
    content: 'Drafting executive summary…',
    streaming: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 1400,
    phase: 'writer',
    content:
      '# The Future of Quantum Computing in Cryptography\n\n## Executive Summary\n\nQuantum computing poses a fundamental threat to current public-key cryptography infrastructure…',
    streaming: true,
    subLabel: 'draft',
    tokDelta: 2100,
    costDelta: 0.031,
  },
  {
    delay: 1800,
    phase: 'writer',
    content: 'Report drafted: 4 sections, 1,847 words, 6 citations. Passing to fact-checker.',
    subLabel: 'complete',
    tokDelta: 3200,
    costDelta: 0.046,
  },
  {
    delay: 200,
    phase: 'metric',
    content: 'Writer: 5,300 tokens · $0.077 · 3.8 s',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 150,
    phase: 'agent',
    content: 'Fact-checker agent initialised',
    subLabel: 'agent:start',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 700,
    phase: 'factchecker',
    content: 'Verifying claim: CRQC requires ~4,000 logical qubits — ✓ confirmed across 3 sources',
    subLabel: 'checking',
    tokDelta: 480,
    costDelta: 0.007,
  },
  {
    delay: 600,
    phase: 'factchecker',
    content:
      'Verifying claim: NIST FIPS 203/204/205 finalized August 2024 — ✓ confirmed, primary source',
    subLabel: 'checking',
    tokDelta: 390,
    costDelta: 0.006,
  },
  {
    delay: 500,
    phase: 'factchecker',
    content:
      'Verifying claim: IBM Condor has ~1,000 physical qubits — ✓ confirmed (IBM Quantum Roadmap 2023)',
    subLabel: 'checking',
    tokDelta: 420,
    costDelta: 0.006,
  },
  {
    delay: 600,
    phase: 'factchecker',
    content: 'All 6 key claims verified. No contradictions found. Report approved.',
    subLabel: 'verdict: pass',
    tokDelta: 310,
    costDelta: 0.005,
  },
  {
    delay: 200,
    phase: 'metric',
    content: 'Fact-checker: 1,600 tokens · $0.024 · 2.4 s',
    verboseOnly: true,
    tokDelta: 0,
    costDelta: 0,
  },
  {
    delay: 400,
    phase: 'complete',
    content: 'Run completed successfully. Total: 22,481 tokens · $2.847',
    subLabel: 'done',
    tokDelta: 0,
    costDelta: 0,
  },
];

function App() {
  const [activeTool, setActiveTool] = React.useState('deep-research');
  const [view, setView] = React.useState('run'); // 'run' | 'report' | 'settings'
  const [status, setStatus] = React.useState('idle'); // idle|running|completed|failed|cancelled
  const [events, setEvents] = React.useState([]);
  const [tokens, setTokens] = React.useState(0);
  const [cost, setCost] = React.useState(0);
  const [runId, setRunId] = React.useState(null);
  const [history, setHistory] = React.useState(FAKE_HISTORY);
  const [activeRunId, setActiveRunId] = React.useState(null);
  const [hitlOpen, setHitlOpen] = React.useState(false);
  const [pendingPlan, setPendingPlan] = React.useState(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(true);
  const [verbose, setVerbose] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const [searchQ, setSearchQ] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState(null);
  const [globalSettings, setGlobalSettings] = React.useState(GLOBAL_DEFAULTS);
  const [toolSettings, setToolSettings] = React.useState({
    depth: 3,
    budgetUsd: 5,
    maxTokens: 100000,
    hitl: false,
    ephemeral: false,
  });
  const [form, setForm] = React.useState({
    query: '',
    model: 'claude-opus-4-5',
    depth: 3,
    budgetUsd: 5,
    maxTokens: 100000,
    hitl: false,
    ephemeral: false,
    resumeRunId: '',
  });

  const timerRefs = React.useRef([]);
  const abortRef = React.useRef(false);

  // Tweaks
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
    accentHue: 262,
    fontScale: 1,
    sidebarWidth: 220,
    settingsWidth: 308,
  } /*EDITMODE-END*/;
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      return { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem('ws_tweaks') || '{}') };
    } catch {
      return TWEAK_DEFAULTS;
    }
  });
  const setTweak = (k, v) =>
    setTweaks((p) => {
      const n = { ...p, [k]: v };
      localStorage.setItem('ws_tweaks', JSON.stringify(n));
      return n;
    });

  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', `oklch(65% 0.18 ${tweaks.accentHue})`);
    document.documentElement.style.setProperty(
      '--accent-hover',
      `oklch(70% 0.18 ${tweaks.accentHue})`,
    );
    document.documentElement.style.setProperty(
      '--accent-subtle',
      `oklch(65% 0.18 ${tweaks.accentHue} / 0.14)`,
    );
    document.documentElement.style.setProperty(
      '--accent-border',
      `oklch(65% 0.18 ${tweaks.accentHue} / 0.35)`,
    );
    document.documentElement.style.setProperty('--sidebar-w', `${tweaks.sidebarWidth}px`);
    document.documentElement.style.setProperty('--settings-w', `${tweaks.settingsWidth}px`);
    document.documentElement.style.fontSize = `${13 * tweaks.fontScale}px`;
  }, [tweaks]);

  // Tweaks host protocol
  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const addToast = (message, type = 'info') => {
    const id = evId();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  };

  const clearTimers = () => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  };

  const runStream = (hitlApproved = false) => {
    abortRef.current = false;
    let t = 0;
    let tokAcc = 0,
      costAcc = 0;
    const script = hitlApproved
      ? STREAM_SCRIPT.filter((s) => s.phase !== 'planner')
      : STREAM_SCRIPT;

    const relevantScript = form.hitl ? script : script.filter((_, i) => i !== 1); // remove HITL gate event slot

    relevantScript.forEach((step, i) => {
      t += step.delay;
      const tid = setTimeout(() => {
        if (abortRef.current) return;

        // HITL gate: after planner plan event, show modal
        if (form.hitl && i === 1 && !hitlApproved) {
          const plan = { ...FAKE_PLAN, query: form.query || 'Quantum computing and cryptography' };
          setPendingPlan(plan);
          setHitlOpen(true);
          clearTimers();
          return;
        }

        tokAcc += Math.floor(Math.random() * 800 + 200);
        costAcc += Math.random() * 0.15 + 0.02;
        setTokens(tokAcc);
        setCost(parseFloat(costAcc.toFixed(4)));

        const ev = {
          id: evId(),
          ts: Date.now(),
          ...step,
          streaming: step.streaming && i < relevantScript.length - 1,
        };
        setEvents((p) => [...p, ev]);

        if (step.phase === 'complete') {
          setStatus('completed');
          const newRun = {
            id: runId || genId(),
            tool: activeTool,
            query: form.query || 'Quantum computing and cryptography',
            status: 'completed',
            cost: parseFloat(costAcc.toFixed(3)),
            ts: Date.now(),
          };
          setHistory((p) => [newRun, ...p.filter((r) => r.id !== newRun.id)]);
        }
      }, t);
      timerRefs.current.push(tid);
    });
  };

  const handleRun = () => {
    clearTimers();
    const id = genId();
    setRunId(id);
    setActiveRunId(id);
    setEvents([]);
    setTokens(0);
    setCost(0);
    setStatus('running');
    setView('run');
    setPinned(true);
    runStream();
  };

  const handleStop = () => {
    clearTimers();
    abortRef.current = true;
    setStatus('cancelled');
    addToast('Run stopped by user', 'info');
    setEvents((p) => [
      ...p,
      {
        id: evId(),
        ts: Date.now(),
        phase: 'error',
        content: 'Run cancelled by user.',
        subLabel: 'aborted',
      },
    ]);
  };

  const handleHitlApprove = (plan) => {
    setHitlOpen(false);
    setPendingPlan(null);
    setEvents((p) => [
      ...p,
      {
        id: evId(),
        ts: Date.now(),
        phase: 'planner',
        content: `Plan approved. ${plan.subquestions.length} sub-questions confirmed.`,
        subLabel: 'approved',
      },
    ]);
    runStream(true);
  };

  const handleHitlReject = () => {
    setHitlOpen(false);
    setStatus('cancelled');
    setEvents((p) => [
      ...p,
      {
        id: evId(),
        ts: Date.now(),
        phase: 'error',
        content: 'Plan rejected by user. Run cancelled.',
        subLabel: 'rejected',
      },
    ]);
    addToast('Plan rejected — run cancelled', 'error');
  };

  const handleSelectRun = (run) => {
    setActiveRunId(run.id);
    setRunId(run.id);
    setStatus(run.status);
    setView(run.status === 'completed' ? 'report' : 'run');
    setEvents([]);
    setTokens(0);
    setCost(run.cost || 0);
    // In real app: replay event log; here we simulate
    if (run.status === 'completed') {
      setView('report');
    }
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && status === 'idle' && form.query.trim())
        handleRun();
      if (e.key === 'Escape') {
        setHitlOpen(false);
        setTweaksOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, form.query]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left Sidebar */}
      <Sidebar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        history={history}
        activeRunId={activeRunId}
        onSelectRun={handleSelectRun}
        searchQuery={searchQ}
        setSearchQuery={setSearchQ}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
      />

      {/* Center Stage */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s4)',
            padding: '0 var(--s5)',
            borderBottom: '1px solid var(--border-subtle)',
            height: 'var(--header-h)',
            flexShrink: 0,
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            {view !== 'settings' && (
              <Badge
                variant={
                  status === 'running'
                    ? 'running'
                    : status === 'completed'
                      ? 'success'
                      : status === 'failed'
                        ? 'error'
                        : status === 'cancelled'
                          ? 'cancelled'
                          : 'default'
                }
              >
                {status}
              </Badge>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {view !== 'settings' && form.query && (
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {form.query}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            {/* View switcher */}
            {view !== 'settings' && (status === 'completed' || status === 'running') && (
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--r-sm)',
                  padding: 2,
                  border: '1px solid var(--border-subtle)',
                  gap: 2,
                }}
              >
                {['run', 'report'].map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--r-xs)',
                      fontSize: 'var(--text-xs)',
                      background: view === v ? 'var(--bg-overlay)' : 'transparent',
                      border:
                        view === v ? '1px solid var(--border-subtle)' : '1px solid transparent',
                      color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'all var(--t-fast)',
                    }}
                  >
                    {v === 'run' ? 'Stream' : 'Report'}
                  </button>
                ))}
              </div>
            )}
            <Tooltip tip="Settings">
              <button
                onClick={() => setView((v) => (v === 'settings' ? 'run' : 'settings'))}
                style={{
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: view === 'settings' ? 'var(--accent-subtle)' : 'transparent',
                  border: `1px solid ${view === 'settings' ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  color: view === 'settings' ? 'var(--accent)' : 'var(--text-tertiary)',
                  transition: 'all var(--t-fast)',
                }}
              >
                {/* Moon icon */}
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path
                    d="M10.5 7.5A5 5 0 0 1 5 2a5 5 0 1 0 5.5 5.5z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Main content */}
        {view === 'settings' ? (
          <SettingsPanel
            open={true}
            onClose={() => setView('run')}
            activeTool={activeTool}
            toolSettings={toolSettings}
            setToolSettings={setToolSettings}
            globalSettings={globalSettings}
            setGlobalSettings={setGlobalSettings}
          />
        ) : view === 'report' && status === 'completed' ? (
          <ReportView onBack={() => setView('run')} runId={runId} />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {status === 'idle' || (!events.length && status !== 'running') ? (
              /* Run Form */
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <RunForm
                  form={form}
                  setForm={setForm}
                  onRun={handleRun}
                  onStop={handleStop}
                  status={status}
                  globalSettings={globalSettings}
                />
                {/* Empty state hint */}
                {status === 'idle' && !events.length && (
                  <div
                    style={{
                      padding: '0 var(--s5) var(--s8)',
                      textAlign: 'center',
                      color: 'var(--text-disabled)',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 'var(--s3)',
                        padding: 'var(--s8) var(--s10)',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--r-xl)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity="0.4">
                        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" />
                        <path
                          d="M24 24L31 31"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M12 16h8M16 12v8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div>
                        <p
                          style={{
                            fontSize: 'var(--text-md)',
                            color: 'var(--text-tertiary)',
                            marginBottom: 'var(--s1)',
                          }}
                        >
                          No active run
                        </p>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-disabled)' }}>
                          Enter a research question above and press Run
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Split: compact form + stream */
              <div
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              >
                {/* Compact form bar */}
                <div
                  style={{
                    padding: 'var(--s3) var(--s5)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    gap: 'var(--s3)',
                    alignItems: 'center',
                    background: 'var(--bg-surface)',
                    flexShrink: 0,
                  }}
                >
                  <textarea
                    value={form.query}
                    onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))}
                    rows={2}
                    disabled={status === 'running'}
                    placeholder="Research question…"
                    style={{
                      flex: 1,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-sm)',
                      padding: 'var(--s2) var(--s3)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--text-sm)',
                      outline: 'none',
                      resize: 'none',
                      lineHeight: 'var(--leading-normal)',
                    }}
                  />
                  {status === 'running' ? (
                    <Button variant="danger" size="md" onClick={handleStop}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />
                      </svg>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleRun}
                      disabled={!form.query.trim()}
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M2.5 1.5L9.5 5.5L2.5 9.5V1.5Z" fill="currentColor" />
                      </svg>
                      Run
                    </Button>
                  )}
                </div>
                <StreamView
                  events={events}
                  tokens={tokens}
                  cost={cost}
                  status={status}
                  query={form.query}
                  runId={runId}
                  onViewReport={() => setView('report')}
                  pinned={pinned}
                  setPinned={setPinned}
                  verbose={verbose}
                  setVerbose={setVerbose}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* HITL Modal */}
      <HitlModal
        open={hitlOpen}
        plan={pendingPlan}
        onApprove={handleHitlApprove}
        onReject={handleHitlReject}
      />

      {/* Toasts */}
      <Toast toasts={toasts} removeToast={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      {/* Tweaks Panel */}
      {tweaksOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 'var(--s6)',
            right: 'var(--s6)',
            zIndex: 800,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s4)',
            boxShadow: 'var(--shadow-xl)',
            width: 260,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s4)',
            animation: 'scaleIn var(--t-enter)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              marginBottom: 'var(--s1)',
            }}
          >
            Tweaks
          </div>
          <Slider
            label="Accent Hue"
            value={tweaks.accentHue}
            min={0}
            max={360}
            step={5}
            onChange={(v) => setTweak('accentHue', v)}
            formatValue={(v) => `${v}°`}
          />
          <Slider
            label="Font Scale"
            value={tweaks.fontScale}
            min={0.85}
            max={1.2}
            step={0.05}
            onChange={(v) => setTweak('fontScale', v)}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Sidebar Width"
            value={tweaks.sidebarWidth}
            min={160}
            max={300}
            step={10}
            onChange={(v) => setTweak('sidebarWidth', v)}
            formatValue={(v) => `${v}px`}
          />
          <Slider
            label="Settings Width"
            value={tweaks.settingsWidth}
            min={240}
            max={420}
            step={10}
            onChange={(v) => setTweak('settingsWidth', v)}
            formatValue={(v) => `${v}px`}
          />
          <Divider />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTweaks(TWEAK_DEFAULTS);
              localStorage.removeItem('ws_tweaks');
            }}
            style={{ justifyContent: 'center' }}
          >
            Reset to defaults
          </Button>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
