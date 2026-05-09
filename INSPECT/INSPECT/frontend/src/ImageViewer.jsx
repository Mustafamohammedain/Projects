import React, { useRef, useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getImgUrl(camName, flight) {
  const base = flight === 'non-georef' ? `${API}/images/005` : `${API}/images/004`;
  return `${base}/${encodeURIComponent(camName)}`;
}

export default function ImageViewer({ projection }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [scale,     setScale]     = useState(1);
  const [offset,    setOffset]    = useState({ x: 0, y: 0 });
  const [dragging,  setDragging]  = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [imgError,  setImgError]  = useState(false);
  const viewportRef = useRef(null);

  const results = projection?.results || [];
  const active  = results[activeIdx] || null;

  // Fit new projection into viewport
  useEffect(() => {
    const first = projection?.results?.[0];
    if (!first || !viewportRef.current) return;
    setActiveIdx(0);
    setImgError(false);
    fitToViewport(first, viewportRef.current);
  }, [projection]);

  // Fit when switching cameras in the strip
  useEffect(() => {
    if (!active || !viewportRef.current) return;
    setImgError(false);
    fitToViewport(active, viewportRef.current);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  function fitToViewport(cam, vp) {
    const s = Math.min(vp.clientWidth / cam.w, vp.clientHeight / cam.h) * 0.9;
    setScale(s);
    setOffset({
      x: (vp.clientWidth  - cam.w * s) / 2,
      y: (vp.clientHeight - cam.h * s) / 2,
    });
  }

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale(s => Math.max(0.05, Math.min(s * factor, 30)));
  }, []);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const onMouseMove = (e) => {
    if (!dragging || !dragStart) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => { setDragging(false); setDragStart(null); };

  if (!active) {
    return (
      <div className="image-empty">
        <div className="image-empty-icon">🛸</div>
        <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>No point selected</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Click anywhere on the 3D model<br />to project into imagery
        </p>
      </div>
    );
  }

  const cx = active.u * scale + offset.x;
  const cy = active.v * scale + offset.y;

  return (
    <>
      <div
        ref={viewportRef}
        className="image-viewport"
        style={{ cursor: dragging ? 'grabbing' : 'grab', flex: 1 }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {imgError ? (
          <div className="img-error-state">
            <div className="img-error-icon">⚠</div>
            <p>Image unavailable</p>
            <code>{active.name}</code>
            <button className="btn btn-secondary img-retry-btn" onClick={() => setImgError(false)}>
              Retry
            </button>
          </div>
        ) : (
          <img
            key={active.name}
            src={getImgUrl(active.name, active.flight)}
            alt={`Camera view: ${active.name}`}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            draggable={false}
            onError={() => setImgError(true)}
          />
        )}

        {!imgError && (
          <svg className="crosshair-svg" style={{ pointerEvents: 'none' }}>
            <circle cx={cx} cy={cy} r={20} fill="none" stroke="rgba(0,210,255,.3)" strokeWidth="1.5">
              <animate attributeName="r"       values="12;28;12" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={cx} cy={cy} r={10} fill="rgba(0,210,255,.08)" stroke="#00d2ff" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r={3}  fill="#00d2ff" />
            <line x1={cx - 24} y1={cy} x2={cx - 12} y2={cy} stroke="#00d2ff" strokeWidth="1.5" />
            <line x1={cx + 12} y1={cy} x2={cx + 24} y2={cy} stroke="#00d2ff" strokeWidth="1.5" />
            <line x1={cx} y1={cy - 24} x2={cx} y2={cy - 12} stroke="#00d2ff" strokeWidth="1.5" />
            <line x1={cx} y1={cy + 12} x2={cx} y2={cy + 24} stroke="#00d2ff" strokeWidth="1.5" />
            <rect x={cx + 14} y={cy - 20} width={90} height={18} rx="3"
              fill="rgba(13,17,23,.85)" stroke="rgba(0,210,255,.4)" strokeWidth="1" />
            <text x={cx + 58} y={cy - 7} textAnchor="middle"
              fill="#00d2ff" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="500">
              {`${active.u.toFixed(0)}, ${active.v.toFixed(0)} px`}
            </text>
          </svg>
        )}
      </div>

      <div className="cam-info-bar">
        <div>
          <span className="cam-info-label">Camera</span>
          <span className="cam-info-val" style={{ color: 'var(--accent-cyan)', marginLeft: 8 }}>{active.name}</span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border-glass)' }} />
        <div>
          <span className="cam-info-label">Depth</span>
          <span className="cam-info-val" style={{ marginLeft: 8 }}>{active.depth.toFixed(1)}m</span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border-glass)' }} />
        <div>
          <span className="cam-info-label">Match</span>
          <span className="cam-info-val" style={{ color: 'var(--accent-amber)', marginLeft: 8 }}>
            {activeIdx + 1} / {results.length}
          </span>
        </div>
      </div>

      <div className="thumb-strip">
        {results.slice(0, 20).map((r, i) => (
          <div
            key={r.name + i}
            className={`thumb ${i === activeIdx ? 'active' : ''}`}
            onClick={() => setActiveIdx(i)}
            title={r.name}
          >
            <img src={getImgUrl(r.name, r.flight)} alt={r.name} loading="lazy" />
            <div className="thumb-rank">#{i + 1}</div>
          </div>
        ))}
      </div>
    </>
  );
}
