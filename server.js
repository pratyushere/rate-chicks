const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');

const app  = express();
const PORT = 3500;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
// Serve root folder → index.html, style.css, app.js
app.use(express.static(path.join(__dirname)));
// Serve public/ folder → admin.html and its css/js
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/photos', express.static(path.join(__dirname, 'data', 'photos')));

// ── Multer (photo uploads) ─────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination(req, file, cb) { cb(null, path.join(__dirname, 'data', 'photos')); },
    filename(req, file, cb) {
        const id  = String(req.params.id || 'unknown').padStart(5, '0');
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${id}_MANUAL_UPLOAD${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Data helpers ───────────────────────────────────────────────────────────
const DB_PATH     = path.join(__dirname, 'data', 'students.json');
const DISCREP_PATH = path.join(__dirname, 'data', 'discrepancies.json');

function getStudents()       { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveStudents(d)     { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2), 'utf-8'); }
function getDiscrepancies()  {
    if (!fs.existsSync(DISCREP_PATH)) return [];
    return JSON.parse(fs.readFileSync(DISCREP_PATH, 'utf-8'));
}
function saveDiscrepancies(d){ fs.writeFileSync(DISCREP_PATH, JSON.stringify(d, null, 2), 'utf-8'); }

// ── Admin auth middleware (for mutation routes) ────────────────────────────
const ADMIN_PASSWORD = 'admin123';
function requireAdmin(req, res, next) {
    const pwd = req.body?.password || req.headers['x-admin-password'];
    if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /api/random?gender=Male|Female&exclude=1,2,3
app.get('/api/random', (req, res) => {
    const { gender, exclude } = req.query;
    if (!gender || !['Male', 'Female'].includes(gender))
        return res.status(400).json({ error: 'gender must be Male or Female' });

    const students = getStudents();
    let pool = students.filter(s => s.gender === gender && s.active !== false);

    if (exclude) {
        const excludeIds = exclude.split(',').map(Number);
        const filtered   = pool.filter(s => !excludeIds.includes(s.id));
        pool = filtered.length > 0 ? filtered : pool;
    }
    if (!pool.length) return res.status(404).json({ error: 'No students found' });

    res.json(pool[Math.floor(Math.random() * pool.length)]);
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
    const students   = getStudents();
    const active     = students.filter(s => s.active !== false);
    const discrepancies = getDiscrepancies();
    res.json({
        total:     students.length,
        active:    active.length,
        hidden:    students.length - active.length,
        male:      active.filter(s => s.gender === 'Male').length,
        female:    active.filter(s => s.gender === 'Female').length,
        flagged:   discrepancies.filter(d => !d.resolved).length,
    });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /api/students — list all (with optional search)
app.get('/api/students', (req, res) => {
    const { q, gender } = req.query;
    let students = getStudents();
    if (gender) students = students.filter(s => s.gender === gender);
    if (q)      students = students.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    res.json(students);
});

// PATCH /api/students/:id — toggle active
app.patch('/api/students/:id', requireAdmin, (req, res) => {
    const id       = parseInt(req.params.id);
    const students = getStudents();
    const student  = students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Not found' });

    student.active = req.body.active !== undefined ? req.body.active : !student.active;
    saveStudents(students);
    res.json(student);
});

// PATCH /api/students/:id/name — edit student name
app.patch('/api/students/:id/name', requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const id       = parseInt(req.params.id);
    const students = getStudents();
    const student  = students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Not found' });

    student.name = name.trim().toUpperCase();
    saveStudents(students);

    // Auto-resolve discrepancy if name was edited
    const discreps = getDiscrepancies();
    const d = discreps.find(d => d.id === id);
    if (d) {
        d.resolved = true;
        d.resolution = `Name corrected to: ${student.name}`;
        saveDiscrepancies(discreps);
    }

    res.json(student);
});

// POST /api/students/:id/photo — upload corrected photo
app.post('/api/students/:id/photo', (req, res, next) => {
    // Auth check before multer (body not parsed yet, use header)
    const pwd = req.headers['x-admin-password'];
    if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    next();
}, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const id       = parseInt(req.params.id);
    const students = getStudents();
    const student  = students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Not found' });

    const relPath  = `photos/${req.file.filename}`;
    student.photo  = relPath;
    student.ocr_match = true;  // admin-uploaded = trusted
    saveStudents(students);

    // Auto-resolve discrepancy
    const discreps = getDiscrepancies();
    const d = discreps.find(d => d.id === id);
    if (d) {
        d.resolved   = true;
        d.resolution = `Photo manually replaced: ${req.file.filename}`;
        saveDiscrepancies(discreps);
    }

    res.json({ success: true, student });
});

// ── Discrepancy routes ────────────────────────────────────────────────────

// GET /api/discrepancies
app.get('/api/discrepancies', (req, res) => {
    const all  = getDiscrepancies();
    const { resolved } = req.query;
    if (resolved === 'false') return res.json(all.filter(d => !d.resolved));
    if (resolved === 'true')  return res.json(all.filter(d => d.resolved));
    res.json(all);
});

// PATCH /api/discrepancies/:id/resolve — mark resolved
app.patch('/api/discrepancies/:id/resolve', requireAdmin, (req, res) => {
    const id      = parseInt(req.params.id);
    const discreps = getDiscrepancies();
    const d        = discreps.find(d => d.id === id);
    if (!d) return res.status(404).json({ error: 'Not found' });

    d.resolved   = true;
    d.resolution = req.body.note || 'Manually resolved by admin';
    saveDiscrepancies(discreps);
    res.json(d);
});

// ── Catch-all → SPA ───────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Smash or Pass server -> http://localhost:${PORT}`);
    console.log(`Admin dashboard      -> http://localhost:${PORT}/admin.html`);
});
