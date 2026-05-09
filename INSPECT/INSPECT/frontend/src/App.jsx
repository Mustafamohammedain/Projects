import React, { useState, useRef, useCallback, useEffect } from 'react';
import CesiumViewer from './CesiumViewer';
import ImageViewer  from './ImageViewer';
import './index.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const SEVERITIES = ['critical', 'warning', 'info', 'good'];
const SEV_COLOR  = {
  critical: 'var(--severity-critical)',
  warning:  'var(--severity-warning)',
  info:     'var(--severity-info)',
  good:     'var(--severity-good)',
};

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const Icon = {
  Logo:   () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 20 2 20"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>,
  Eye:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Edit:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Pin:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Trash:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Camera: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Layers: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Export: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Home:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Close:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ── Toast hook ────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, add };
}

// ── Annotation Form ───────────────────────────────────────────────────────────
function AnnotationForm({ ecef, onSave, onCancel, onError }) {
  const [label,    setLabel]    = useState('');
  const [desc,     setDesc]     = useState('');
  const [severity, setSeverity] = useState('warning');
  const [saving,   setSaving]   = useState(false);

  async function submit() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/annotations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ label: label.trim(), description: desc.trim(), severity, ecef }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      onSave(await res.json());
    } catch (e) {
      onError?.(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="annotation-form">
      <div className="form-title"><Icon.Pin /> New Finding</div>
      <div className="form-group">
        <div className="form-label">Label *</div>
        <input
          className="form-input"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Corrosion spot, crack..."
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="form-group">
        <div className="form-label">Description</div>
        <textarea
          className="form-textarea"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Detailed observation..."
          rows={2}
          maxLength={2000}
        />
      </div>
      <div className="form-group">
        <div className="form-label">Severity</div>
        <div className="severity-pills">
          {SEVERITIES.map(s => (
            <div
              key={s}
              className={`severity-pill ${s} ${severity === s ? 'sel' : ''}`}
              onClick={() => setSeverity(s)}
            >
              {s}
            </div>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={submit} disabled={saving || !label.trim()}>
          {saving ? 'Saving…' : 'Save Finding'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [mode,          setMode]          = useState('inspect');
  const [projection,    setProjection]    = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [annotations,   setAnnotations]   = useState([]);
  const [showForm,      setShowForm]      = useState(false);
  const [pendingEcef,   setPendingEcef]   = useState(null);
  const [selectedAnn,   setSelectedAnn]   = useState(null);
  const [camCount,      setCamCount]      = useState('…');
  const [hovCoord,      setHovCoord]      = useState(null);
  const [backendStatus, setBackendStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const { toasts, add: toast } = useToast();
  const cesiumRef = useRef(null);

  useEffect(() => {
    // Load annotations and camera count, set backend status
    Promise.all([
      fetch(`${API}/api/annotations`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`${API}/api/cameras/count`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ])
      .then(([anns, counts]) => {
        setAnnotations(anns);
        setCamCount(counts.total);
        setBackendStatus('ok');
      })
      .catch(() => {
        setBackendStatus('error');
        toast('Backend unreachable — start the server and refresh.', 'error');
      });

    // Coordinate HUD via CustomEvent (dispatched by CesiumViewer)
    const onCoord = (e) => setHovCoord(e.detail);
    window.addEventListener('inspect:coord', onCoord);
    return () => window.removeEventListener('inspect:coord', onCoord);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickPoint = useCallback(async ({ x, y, z }) => {
    setLoading(true);
    setShowForm(false);
    try {
      const res = await fetch(`${API}/api/project`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x, y, z }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setProjection(data);
      if (mode === 'annotate') {
        setPendingEcef({ x, y, z });
        setShowForm(true);
      } else {
        toast(`Found ${data.total} matching view${data.total !== 1 ? 's' : ''}`, 'info');
      }
    } catch (e) {
      toast('Projection failed — is the backend running?', 'error');
    } finally {
      setLoading(false);
    }
  }, [mode, toast]);

  const handleSave = useCallback((ann) => {
    setAnnotations(prev => [...prev, ann]);
    setShowForm(false);
    setPendingEcef(null);
    toast(`Finding "${ann.label}" saved`, 'success');
  }, [toast]);

  const handleDelete = useCallback(async (id) => {
    try {
      const res = await fetch(`${API}/api/annotations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      if (selectedAnn === id) setSelectedAnn(null);
      toast('Finding deleted', 'info');
    } catch {
      toast('Delete failed — check connection', 'error');
    }
  }, [selectedAnn, toast]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(annotations, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `inspect_findings_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported findings JSON', 'success');
  }, [annotations, toast]);

  const sevCount = (s) => annotations.filter(a => a.severity === s).length;

  return (
    <div className="app">
      {/* Full-bleed 3D background */}
      <div className="cesium-background">
        <CesiumViewer
          ref={cesiumRef}
          onPickPoint={handlePickPoint}
          mode={mode}
          annotations={annotations}
          onTilesetError={(msg) => toast(msg, 'error')}
        />
      </div>

      {/* UI overlay */}
      <div className="ui-layer">

        {/* Header */}
        <header className="header-glass">
          <div className="header-logo">
            <Icon.Logo />
            <span>INSPECT</span>view
          </div>

          <div className="header-divider" />

          <div className="header-badges">
            <span className="badge badge-cyan"><Icon.Layers /> 3D Mesh</span>
            <span className="badge badge-blue"><Icon.Camera /> {camCount} Cameras</span>
            {annotations.length > 0 && (
              <span className="badge badge-amber"><Icon.Pin /> {annotations.length} Findings</span>
            )}
          </div>

          <div className="header-divider" />

          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'inspect' ? 'active-inspect' : ''}`}
              onClick={() => setMode('inspect')}
              aria-label="Switch to Inspect mode"
            >
              <Icon.Eye /> Inspect
            </button>
            <button
              className={`mode-btn ${mode === 'annotate' ? 'active-annotate' : ''}`}
              onClick={() => setMode('annotate')}
              aria-label="Switch to Annotate mode"
            >
              <Icon.Edit /> Annotate
            </button>
          </div>

          <div className="header-spacer" />

          {loading && <div className="spinner" title="Projecting…" />}

          <div className="header-status">
            <div className={`status-dot ${backendStatus === 'error' ? 'offline' : backendStatus === 'loading' ? 'connecting' : ''}`} />
            {backendStatus === 'ok' ? 'LIVE' : backendStatus === 'loading' ? 'CONNECTING' : 'OFFLINE'}
          </div>

          <button
            className="header-btn"
            onClick={() => cesiumRef.current?.flyToTileset()}
            title="Fly to tower"
          >
            <Icon.Home /> Reset
          </button>
          <button
            className="header-btn"
            onClick={handleExport}
            disabled={!annotations.length}
            title={annotations.length ? 'Export findings as JSON' : 'No findings to export'}
          >
            <Icon.Export /> Export
          </button>
        </header>

        {/* Workspace */}
        <div className="workspace-overlay">

          {/* Left sidebar */}
          <aside className="sidebar-glass">
            <div className="sidebar-section">
              <div className="sidebar-section-title"><Icon.Layers /> Overview</div>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-value red">{sevCount('critical')}</div>
                  <div className="stat-label">Critical</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value amber">{sevCount('warning')}</div>
                  <div className="stat-label">Warning</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value blue">{sevCount('info')}</div>
                  <div className="stat-label">Info</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value green">{sevCount('good')}</div>
                  <div className="stat-label">Good</div>
                </div>
              </div>
            </div>

            <div className="sidebar-section" style={{ paddingBottom: 0, borderBottom: 'none' }}>
              <div className="sidebar-section-title">
                <Icon.Pin /> Findings ({annotations.length})
              </div>
            </div>
            <div className="findings-scroll ui-panel">
              {annotations.length === 0 ? (
                <div className="empty-state">
                  <Icon.Pin />
                  <p>No findings recorded</p>
                  <p style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                    Switch to Annotate mode<br />and click on the 3D mesh
                  </p>
                </div>
              ) : (
                [...annotations].reverse().map(ann => (
                  <div
                    key={ann.id}
                    className={`finding-card ${selectedAnn === ann.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAnn(ann.id === selectedAnn ? null : ann.id)}
                  >
                    <div className="finding-header">
                      <div className="severity-dot" style={{ color: SEV_COLOR[ann.severity], background: SEV_COLOR[ann.severity] }} />
                      <div className="finding-title">{ann.label}</div>
                      <div className="finding-id">#{String(ann.id).padStart(4, '0')}</div>
                    </div>
                    <div className="finding-meta">
                      <span className="tag">{ann.severity}</span>
                      {ann.createdAt && (
                        <span className="tag">{new Date(ann.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    {ann.description && (
                      <div className="finding-desc">{ann.description}</div>
                    )}
                    <div className="finding-actions">
                      <button
                        className="finding-action-btn delete"
                        onClick={e => { e.stopPropagation(); handleDelete(ann.id); }}
                        aria-label={`Delete finding: ${ann.label}`}
                      >
                        <Icon.Trash /> Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Center area */}
          <div className="center-overlays">
            {/* Coordinate HUD — always visible */}
            <div className="coord-panel">
              <div>Lat <span>{hovCoord?.lat ?? '—'}°</span></div>
              <div>Lon <span>{hovCoord?.lon ?? '—'}°</span></div>
              <div>Alt <span>{hovCoord ? `${hovCoord.alt}m` : '—'}</span></div>
            </div>

            {/* Click hint */}
            {!projection && !loading && (
              <div className="click-hint">
                <div className="click-hint-inner">
                  <div className="click-hint-icon">
                    {mode === 'inspect' ? <Icon.Eye /> : <Icon.Pin />}
                  </div>
                  <div className="click-hint-text">
                    {mode === 'inspect' ? 'Click on 3D Model to Inspect' : 'Select Point to Annotate'}
                  </div>
                  <div className="click-hint-sub">
                    {mode === 'inspect'
                      ? 'Projects 3D coordinates into hi-res drone imagery'
                      : 'Record defects and structural observations'}
                  </div>
                </div>
              </div>
            )}

            {/* Mode banner */}
            <div className="mode-banner" style={{
              background:  mode === 'annotate' ? 'rgba(255,158,100,0.15)' : 'rgba(0,210,255,0.15)',
              border:      `1px solid ${mode === 'annotate' ? 'rgba(255,158,100,0.4)' : 'rgba(0,210,255,0.4)'}`,
              color:       mode === 'annotate' ? 'var(--accent-amber)' : 'var(--accent-cyan)',
            }}>
              {mode === 'inspect' ? 'INSPECT MODE' : 'ANNOTATE MODE'}
            </div>
          </div>

          {/* Right pane — image viewer */}
          {projection && (
            <div className="right-glass ui-panel">
              <div className="pane-header">
                <Icon.Camera />
                <span className="pane-title">High-Res Image Projection</span>
                <span className="pane-match-count">{projection.total} Views</span>
                <button
                  className="pane-close"
                  onClick={() => { setProjection(null); setShowForm(false); setPendingEcef(null); }}
                  aria-label="Close image viewer"
                >
                  <Icon.Close />
                </button>
              </div>

              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ImageViewer projection={projection} />

                {showForm && pendingEcef && (
                  <AnnotationForm
                    ecef={pendingEcef}
                    onSave={handleSave}
                    onCancel={() => { setShowForm(false); setPendingEcef(null); }}
                    onError={(msg) => toast(msg, 'error')}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast notifications */}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
