require('dotenv').config();
const express        = require('express');
const cors           = require('cors');
const fs             = require('fs');
const fsp            = fs.promises;
const path           = require('path');
const csv            = require('csv-parser');
const zlib           = require('zlib');
const { promisify }  = require('util');

const gunzip = promisify(zlib.gunzip);

// ── Config ────────────────────────────────────────────────────────────────────
const PORT             = process.env.PORT || 3001;
const CORS_ORIGIN      = process.env.CORS_ORIGIN || 'http://localhost:5173';
const GEOREF_DIR       = process.env.GEOREF_DIR;
const IMG_DIR_004      = process.env.IMG_DIR_004;
const IMG_DIR_005      = process.env.IMG_DIR_005;
const ANNOTATIONS_FILE = process.env.ANNOTATIONS_FILE || path.join(__dirname, 'annotations.json');

if (!GEOREF_DIR || !IMG_DIR_004 || !IMG_DIR_005) {
  console.error('❌  Missing required env vars. Copy .env and fill in dataset paths.');
  process.exit(1);
}

const TILESET_DIR     = path.join(GEOREF_DIR, '3D Tileset');
const TILESET_DIR_ABS = path.resolve(TILESET_DIR);
const CSV_GEO         = path.join(GEOREF_DIR, 'TowerAlignmet.csv');
const CSV_NGEO        = path.join(path.dirname(GEOREF_DIR), 'Not Georefrenced', 'TowerAlignment.csv');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '64kb' }));

// ── Camera store ──────────────────────────────────────────────────────────────
let cameras = [];

function loadCSV(filePath, flightSet) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => header.replace(/^#/, '').trim() }))
      .on('data', r => {
        cameras.push({
          name: r.name,
          flight: flightSet,
          C:  [+r.ecefX,  +r.ecefY,  +r.ecefZ],
          R:  [
            [+r.ecefR00, +r.ecefR01, +r.ecefR02],
            [+r.ecefR10, +r.ecefR11, +r.ecefR12],
            [+r.ecefR20, +r.ecefR21, +r.ecefR22],
          ],
          w: +r.width, h: +r.height,
          f: +r.f, px: +r.px, py: +r.py,
          k1: +(r.k1||0), k2: +(r.k2||0), k3: +(r.k3||0), k4: +(r.k4||0),
          t1: +(r.t1||0), t2: +(r.t2||0),
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

// ── Annotation persistence ────────────────────────────────────────────────────
let annotations = [];
let nextId = 1;

function loadAnnotations() {
  try {
    if (!fs.existsSync(ANNOTATIONS_FILE)) return;
    const data  = JSON.parse(fs.readFileSync(ANNOTATIONS_FILE, 'utf8'));
    annotations = data.annotations || [];
    nextId      = data.nextId || (annotations.length ? Math.max(...annotations.map(a => a.id)) + 1 : 1);
    console.log(`📋  Loaded ${annotations.length} saved annotation(s)`);
  } catch (e) {
    console.error('⚠️   Could not load annotations:', e.message);
  }
}

function saveAnnotations() {
  fsp.writeFile(ANNOTATIONS_FILE, JSON.stringify({ nextId, annotations }, null, 2))
    .catch(e => console.error('⚠️   Could not save annotations:', e.message));
}

// ── Tileset serving ───────────────────────────────────────────────────────────
const TILE_MIME = {
  '.b3dm': 'application/octet-stream',
  '.pnts': 'application/octet-stream',
  '.i3dm': 'application/octet-stream',
  '.cmpt': 'application/octet-stream',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.json': 'application/json',
};
const GZIP_EXTS = new Set(['.b3dm', '.pnts', '.i3dm', '.cmpt']);

app.use('/tileset', async (req, res, next) => {
  const relPath = decodeURIComponent(req.path.replace(/^\//, ''));

  // Reject traversal attempts before path.join
  if (relPath.includes('..') || path.isAbsolute(relPath)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const filePath = path.resolve(path.join(TILESET_DIR_ABS, relPath));

  // Defense-in-depth: verify resolved path stays inside TILESET_DIR
  if (!filePath.startsWith(TILESET_DIR_ABS + path.sep) && filePath !== TILESET_DIR_ABS) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const raw  = await fsp.readFile(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    const mime = TILE_MIME[ext] || 'application/octet-stream';

    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', mime);

    const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
    if (isGzip && GZIP_EXTS.has(ext)) {
      try {
        const buf = await gunzip(raw);
        res.set('Content-Length', buf.length).send(buf);
      } catch {
        res.status(500).json({ error: 'Decompression failed' });
      }
    } else {
      res.set('Content-Length', raw.length).send(raw);
    }
  } catch (e) {
    if (e.code === 'ENOENT') return next();
    console.error('Tile error:', relPath, e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Serve drone images from both flight sets
app.use('/images/004', express.static(IMG_DIR_004));
app.use('/images/005', express.static(IMG_DIR_005));

// ── Projection math (Brown-Conrady) ───────────────────────────────────────────
const PROJECTION_MARGIN_PX = 150;

function project(cam, P) {
  const vx = P[0] - cam.C[0], vy = P[1] - cam.C[1], vz = P[2] - cam.C[2];
  const Xc = cam.R[0][0]*vx + cam.R[0][1]*vy + cam.R[0][2]*vz;
  const Yc = cam.R[1][0]*vx + cam.R[1][1]*vy + cam.R[1][2]*vz;
  const Zc = cam.R[2][0]*vx + cam.R[2][1]*vy + cam.R[2][2]*vz;
  if (Zc < 0.5) return null;

  const xn = Xc / Zc, yn = Yc / Zc;
  const r2 = xn*xn + yn*yn, r4 = r2*r2, r6 = r4*r2, r8 = r4*r4;
  const rd = 1 + cam.k1*r2 + cam.k2*r4 + cam.k3*r6 + cam.k4*r8;
  const xd = xn*rd + 2*cam.t1*xn*yn + cam.t2*(r2 + 2*xn*xn);
  const yd = yn*rd + cam.t1*(r2 + 2*yn*yn) + 2*cam.t2*xn*yn;
  const u  = cam.f * xd + cam.px;
  const v  = cam.f * yd + cam.py;

  if (u < -PROJECTION_MARGIN_PX || u > cam.w + PROJECTION_MARGIN_PX ||
      v < -PROJECTION_MARGIN_PX || v > cam.h + PROJECTION_MARGIN_PX) return null;

  const cx = u - cam.px, cy = v - cam.py;
  const centerDist = Math.sqrt(cx*cx + cy*cy);
  return { name: cam.name, flight: cam.flight, u, v, depth: Zc, centerDist, score: centerDist / Zc, w: cam.w, h: cam.h };
}

// ── Annotation validation ─────────────────────────────────────────────────────
function validateAnnotation({ label, description = '', severity, ecef }) {
  if (!label || typeof label !== 'string' || !label.trim())       return 'label is required';
  if (label.length > 200)                                          return 'label must be ≤200 characters';
  if (typeof description !== 'string' || description.length > 2000) return 'description must be ≤2000 characters';
  if (!['critical', 'warning', 'info', 'good'].includes(severity)) return 'severity must be critical|warning|info|good';
  if (ecef !== undefined && ecef !== null) {
    if (typeof ecef.x !== 'number' || typeof ecef.y !== 'number' || typeof ecef.z !== 'number') {
      return 'ecef must be {x, y, z} numbers';
    }
  }
  return null;
}

// ── API ───────────────────────────────────────────────────────────────────────
app.post('/api/project', (req, res) => {
  const { x, y, z } = req.body;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return res.status(400).json({ error: 'x, y, z must be numbers' });
  }
  const hits = cameras.map(c => project(c, [x, y, z])).filter(Boolean);
  hits.sort((a, b) => a.score - b.score);
  res.json({ total: hits.length, results: hits.slice(0, 30) });
});

app.get('/api/cameras/count', (_req, res) => res.json({ total: cameras.length }));

app.get('/api/annotations', (_req, res) => res.json(annotations));

app.post('/api/annotations', (req, res) => {
  const err = validateAnnotation(req.body);
  if (err) return res.status(400).json({ error: err });

  const { label, description = '', severity, ecef } = req.body;
  const ann = {
    id: nextId++,
    label: label.trim(),
    description: description.trim(),
    severity,
    ecef: ecef || null,
    createdAt: new Date().toISOString(),
  };
  annotations.push(ann);
  saveAnnotations();
  res.status(201).json(ann);
});

app.put('/api/annotations/:id', (req, res) => {
  const id = +req.params.id;
  const i  = annotations.findIndex(a => a.id === id);
  if (i < 0) return res.status(404).json({ error: 'not found' });

  const merged = { ...annotations[i], ...req.body };
  const err = validateAnnotation(merged);
  if (err) return res.status(400).json({ error: err });

  const { label, description, severity } = req.body;
  if (label       !== undefined) annotations[i].label       = label.trim();
  if (description !== undefined) annotations[i].description = description.trim();
  if (severity    !== undefined) annotations[i].severity    = severity;
  saveAnnotations();
  res.json(annotations[i]);
});

app.delete('/api/annotations/:id', (req, res) => {
  const id = +req.params.id;
  const i  = annotations.findIndex(a => a.id === id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  annotations.splice(i, 1);
  saveAnnotations();
  res.json({ ok: true });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  loadAnnotations();

  await loadCSV(CSV_GEO, 'georef');
  console.log(`✅  Loaded ${cameras.length} cameras (georef)`);

  if (fs.existsSync(CSV_NGEO)) {
    const before = cameras.length;
    await loadCSV(CSV_NGEO, 'non-georef');
    console.log(`✅  +${cameras.length - before} cameras (non-georef)`);
  }

  app.listen(PORT, () => console.log(`🚀  Backend → http://localhost:${PORT}`));
}

start().catch(e => { console.error('❌  Startup failed:', e.message); process.exit(1); });
