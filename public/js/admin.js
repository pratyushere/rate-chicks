/* admin.js — Enhanced Admin Dashboard v2 */

// Admin requires the local server. Auto-detect: if on localhost use that,
// otherwise show a "server required" warning.
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API = IS_LOCAL ? `http://localhost:3500` : null;
const ADMIN_PASS_KEY = 'sop_admin_auth';

let allStudents   = [];
let discrepancies = [];
let currentFilter = 'all';
let discrepFilter = 'open';
let searchQuery   = '';
let adminPassword = '';

// Edit modal state
let editingStudentId = null;
// Upload modal state
let uploadingStudentId = null;
let uploadFile = null;

// ── Auth ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // If not on localhost, show a fully self-contained server-required notice
    if (!IS_LOCAL) {
        // Apply dark background directly to body so it's visible even if CSS fails to load
        document.body.style.cssText = 'margin:0;min-height:100vh;background:#0a0a0f;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
        document.getElementById('loginOverlay').style.cssText = 'position:static;display:flex;align-items:center;justify-content:center;width:100%;';
        document.getElementById('loginOverlay').innerHTML = `
          <div style="
            text-align:center; padding:2.5rem 2rem;
            background:#12121a; border:1px solid rgba(255,255,255,0.1);
            border-radius:24px; max-width:460px; width:90%;
            display:flex; flex-direction:column; align-items:center; gap:1.2rem;
            box-shadow:0 24px 80px rgba(0,0,0,0.6);
          ">
            <div style="font-size:3rem">🖥️</div>
            <h1 style="color:#f0f0f8;font-size:1.5rem;font-weight:800;margin:0;letter-spacing:-0.02em">
              Admin Requires Local Server
            </h1>
            <p style="color:rgba(240,240,248,0.55);font-size:0.88rem;line-height:1.7;margin:0">
              The admin dashboard needs the Node.js server running on your machine.
              Start it with:
            </p>
            <code style="
              background:rgba(108,99,255,0.12); border:1px solid rgba(108,99,255,0.3);
              padding:0.5rem 1.2rem; border-radius:10px;
              color:#a5a0ff; font-size:0.9rem; font-family:monospace;
            ">npm start</code>
            <p style="color:rgba(240,240,248,0.55);font-size:0.88rem;margin:0">
              Then open in your browser:
            </p>
            <code style="
              background:rgba(61,142,255,0.1); border:1px solid rgba(61,142,255,0.25);
              padding:0.5rem 1.2rem; border-radius:10px;
              color:#7ab8ff; font-size:0.85rem; font-family:monospace; word-break:break-all;
            ">http://localhost:3500/admin.html</code>
            <a href="index.html" style="
              color:rgba(240,240,248,0.4); text-decoration:none;
              font-size:0.82rem; margin-top:0.3rem;
              transition:color 0.2s;
            " onmouseover="this.style.color='rgba(240,240,248,0.8)'"
               onmouseout="this.style.color='rgba(240,240,248,0.4)'">
              ← Back to Game
            </a>
          </div>`;
        return;
    }

    const saved = sessionStorage.getItem(ADMIN_PASS_KEY);
    if (saved) { adminPassword = saved; unlockDashboard(); }

    // Upload drag-and-drop
    const zone = document.getElementById('uploadDropZone');
    if (zone) {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragging');
            const file = e.dataTransfer?.files[0];
            if (file) setUploadFile(file);
        });
    }
});

function handleLogin(e) {
    e.preventDefault();
    const pwd = document.getElementById('passwordInput').value;
    fetch(`${API}/api/students`)
        .then(() => {
            if (pwd === 'admin123') {
                adminPassword = pwd;
                sessionStorage.setItem(ADMIN_PASS_KEY, pwd);
                unlockDashboard();
            } else {
                showLoginError('Incorrect password. Try again.');
            }
        })
        .catch(() => showLoginError('Cannot connect to server. Is it running?'));
}

function showLoginError(msg) {
    const err = document.getElementById('loginError');
    err.textContent = msg;
    err.style.display = 'block';
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
}

function unlockDashboard() {
    document.getElementById('loginOverlay').style.display   = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    loadAll();
}

function handleLogout() {
    sessionStorage.removeItem(ADMIN_PASS_KEY);
    adminPassword = '';
    allStudents = []; discrepancies = [];
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('loginOverlay').style.display   = 'flex';
    document.getElementById('passwordInput').value = '';
}

// ── Tab Switching ─────────────────────────────────────────────────────────
function switchTab(name, btn) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    document.getElementById(`panel${name.charAt(0).toUpperCase() + name.slice(1)}`).style.display = 'flex';
    if (name === 'discrepancies') renderDiscrepancies();
}

// ── Data Loading ───────────────────────────────────────────────────────────
async function loadAll() {
    await Promise.all([loadStudents(), loadDiscrepancies()]);
}

async function loadStudents() {
    try {
        const res = await fetch(`${API}/api/students`);
        allStudents = await res.json();
        renderTable();
        updateHeaderStats();
    } catch {
        document.getElementById('adminTableBody').innerHTML =
            '<tr><td colspan="6" class="loading-row">Failed to load. Is the server running?</td></tr>';
    }
}

async function loadDiscrepancies() {
    try {
        const res = await fetch(`${API}/api/discrepancies`);
        discrepancies = await res.json();
        updateFixitBadge();
    } catch { discrepancies = []; }
}

function updateHeaderStats() {
    const active  = allStudents.filter(s => s.active !== false).length;
    const hidden  = allStudents.length - active;
    const flagged = discrepancies.filter(d => !d.resolved).length;
    document.getElementById('adminStatActive').textContent  = `${active} Active`;
    document.getElementById('adminStatHidden').textContent  = `${hidden} Hidden`;
    const fpill = document.getElementById('adminStatFlagged');
    if (flagged > 0) {
        fpill.textContent    = `${flagged} Flagged`;
        fpill.style.display  = 'inline-block';
    } else {
        fpill.style.display = 'none';
    }
}

function updateFixitBadge() {
    const open   = discrepancies.filter(d => !d.resolved).length;
    const badge  = document.getElementById('fixitBadge');
    if (open > 0) {
        badge.textContent = open;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

// ── Students Table ─────────────────────────────────────────────────────────
function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('#panelStudents .filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
}

function handleSearch() {
    searchQuery = document.getElementById('searchInput').value.trim();
    document.getElementById('clearSearch').style.display = searchQuery ? 'block' : 'none';
    renderTable();
}
function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    document.getElementById('clearSearch').style.display = 'none';
    renderTable();
}

function getFilteredStudents() {
    let students = [...allStudents];
    if (currentFilter === 'Male')   students = students.filter(s => s.gender === 'Male');
    if (currentFilter === 'Female') students = students.filter(s => s.gender === 'Female');
    if (currentFilter === 'hidden') students = students.filter(s => s.active === false);
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        students = students.filter(s => s.name.toLowerCase().includes(q));
    }
    return students;
}

function renderTable() {
    const students = getFilteredStudents();
    document.getElementById('showingCount').textContent = students.length;
    document.getElementById('totalCount').textContent   = allStudents.length;

    if (!students.length) {
        document.getElementById('adminTableBody').innerHTML =
            '<tr><td colspan="6" class="loading-row">No students found.</td></tr>';
        return;
    }

    document.getElementById('adminTableBody').innerHTML = students.map(s => {
        const isActive = s.active !== false;
        const isFlagged = s.ocr_match === false;

        const photoCell = s.photo
            ? `<img class="admin-photo" src="/data/${s.photo}" alt="${s.name}" loading="lazy" />`
            : `<div class="no-photo">👤</div>`;

        const nameContent = isFlagged
            ? `<span class="student-name-cell">${toTitleCase(s.name)}</span>
               <span class="ocr-flag" title="OCR name: ${s.ocr_name || '?'}">⚠ OCR mismatch</span>`
            : `<span class="student-name-cell ${isActive ? '' : 'hidden-name'}">${toTitleCase(s.name)}</span>`;

        const statusBadge = isActive
            ? '<span class="status-badge active">Active</span>'
            : '<span class="status-badge hidden">Hidden</span>';

        const actionBtn = isActive
            ? `<button class="btn-toggle btn-remove" onclick="toggleStudent(${s.id}, false)">Remove</button>`
            : `<button class="btn-toggle btn-restore" onclick="toggleStudent(${s.id}, true)">Restore</button>`;

        return `<tr id="row-${s.id}" class="${isFlagged ? 'flagged-row' : ''}">
          <td class="num-col">${s.id.toString().padStart(5,'0')}</td>
          <td>${photoCell}</td>
          <td class="name-cell">${nameContent}</td>
          <td><span class="gender-badge ${s.gender.toLowerCase()}">${s.gender}</span></td>
          <td>${statusBadge}</td>
          <td class="action-cell">${actionBtn}</td>
        </tr>`;
    }).join('');
}

async function toggleStudent(id, activeState) {
    try {
        const res = await fetch(`${API}/api/students/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: adminPassword, active: activeState })
        });
        if (res.status === 401) { alert('Session expired.'); handleLogout(); return; }
        const updated = await res.json();
        const idx = allStudents.findIndex(s => s.id === id);
        if (idx !== -1) allStudents[idx] = updated;
        renderTable(); updateHeaderStats();
    } catch { alert('Failed to update. Check server connection.'); }
}

// ── Discrepancies (Fix-it Tab) ─────────────────────────────────────────────
function setDiscrepFilter(filter, btn) {
    discrepFilter = filter;
    document.querySelectorAll('#panelDiscrepancies .filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderDiscrepancies();
}

function getFilteredDiscrepancies() {
    if (discrepFilter === 'open')     return discrepancies.filter(d => !d.resolved);
    if (discrepFilter === 'resolved') return discrepancies.filter(d =>  d.resolved);
    return discrepancies;
}

function renderDiscrepancies() {
    const list    = document.getElementById('discrepList');
    const items   = getFilteredDiscrepancies();

    if (!items.length) {
        const msgs = {
            open: '✅ No open discrepancies! All names verified.',
            resolved: 'No resolved discrepancies yet.',
            all: 'No discrepancies recorded. OCR was not available or all names matched.'
        };
        list.innerHTML = `<div class="discrep-empty">${msgs[discrepFilter]}</div>`;
        return;
    }

    list.innerHTML = items.map(d => {
        const student    = allStudents.find(s => s.id === d.id);
        const photoSrc   = student?.photo ? `/data/${student.photo}` : '';
        const statusClass = d.resolved ? 'discrep-resolved' : 'discrep-open';

        return `<div class="discrep-card ${statusClass}" id="dc-${d.id}">
          <div class="discrep-photo-col">
            ${photoSrc
              ? `<img class="discrep-photo" src="${photoSrc}" alt="${d.name}" />`
              : '<div class="no-photo discrep-no-photo">👤</div>'}
          </div>
          <div class="discrep-info">
            <div class="discrep-id">SL# ${String(d.id).padStart(5,'0')}</div>
            <div class="discrep-names">
              <div class="discrep-name-row">
                <span class="discrep-label">PDF Table:</span>
                <span class="discrep-name-pdf">${toTitleCase(d.name)}</span>
              </div>
              <div class="discrep-name-row">
                <span class="discrep-label">Photo OCR:</span>
                <span class="discrep-name-ocr">${toTitleCase(d.ocr_name || '—')}</span>
              </div>
            </div>
            ${d.resolved
              ? `<div class="discrep-resolved-note">✅ Resolved: ${d.resolution || 'Manually resolved'}</div>`
              : `<div class="discrep-actions">
                   <button class="btn-fix edit-name-btn" onclick="openEditModal(${d.id})">✏️ Fix Name</button>
                   <button class="btn-fix upload-photo-btn" onclick="openUploadModal(${d.id})">📷 New Photo</button>
                   <button class="btn-fix mark-ok-btn" onclick="markResolved(${d.id})">✓ Mark OK</button>
                 </div>`}
          </div>
        </div>`;
    }).join('');
}

async function markResolved(id) {
    try {
        await fetch(`${API}/api/discrepancies/${id}/resolve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: adminPassword, note: 'Verified as correct by admin' })
        });
        const d = discrepancies.find(d => d.id === id);
        if (d) { d.resolved = true; d.resolution = 'Verified as correct by admin'; }
        renderDiscrepancies(); updateFixitBadge(); updateHeaderStats();
    } catch { alert('Failed to update.'); }
}

// ── Edit Name Modal ────────────────────────────────────────────────────────
function openEditModal(id) {
    editingStudentId = id;
    const s = allStudents.find(s => s.id === id);
    document.getElementById('editModalSub').textContent  = `SL# ${String(id).padStart(5,'0')} — Current: ${toTitleCase(s?.name || '')}`;
    document.getElementById('editNameInput').value        = toTitleCase(s?.name || '');
    document.getElementById('editNameModal').style.display = 'flex';
    setTimeout(() => document.getElementById('editNameInput').focus(), 100);
}

function closeEditModal(e) {
    if (e && e.target !== document.getElementById('editNameModal')) return;
    document.getElementById('editNameModal').style.display = 'none';
    editingStudentId = null;
}

async function saveNameEdit() {
    const newName = document.getElementById('editNameInput').value.trim();
    if (!newName || !editingStudentId) return;
    try {
        const res = await fetch(`${API}/api/students/${editingStudentId}/name`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ password: adminPassword, name: newName })
        });
        if (!res.ok) { alert('Failed to save name.'); return; }
        const updated = await res.json();
        const idx = allStudents.findIndex(s => s.id === editingStudentId);
        if (idx !== -1) allStudents[idx] = { ...allStudents[idx], ...updated };
        // Update discrepancy as resolved
        const d = discrepancies.find(d => d.id === editingStudentId);
        if (d) { d.resolved = true; d.resolution = `Name corrected to: ${newName}`; }
        document.getElementById('editNameModal').style.display = 'none';
        renderTable(); renderDiscrepancies(); updateFixitBadge();
    } catch { alert('Error saving name.'); }
}

// ── Upload Photo Modal ─────────────────────────────────────────────────────
function openUploadModal(id) {
    uploadingStudentId = id;
    uploadFile = null;
    const s = allStudents.find(s => s.id === id);
    document.getElementById('uploadModalSub').textContent = `SL# ${String(id).padStart(5,'0')} — ${toTitleCase(s?.name || '')}`;
    document.getElementById('uploadPreviewWrap').style.display = 'none';
    document.getElementById('uploadDropZone').style.display    = 'flex';
    document.getElementById('photoFileInput').value = '';
    document.getElementById('uploadModal').style.display = 'flex';
}

function closeUploadModal(e) {
    if (e && e.target !== document.getElementById('uploadModal')) return;
    document.getElementById('uploadModal').style.display = 'none';
    uploadingStudentId = null; uploadFile = null;
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) setUploadFile(file);
}

function setUploadFile(file) {
    uploadFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
        document.getElementById('uploadPreviewImg').src       = ev.target.result;
        document.getElementById('uploadPreviewName').textContent = file.name;
        document.getElementById('uploadDropZone').style.display   = 'none';
        document.getElementById('uploadPreviewWrap').style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

async function submitPhotoUpload() {
    if (!uploadFile || !uploadingStudentId) return;
    const btn = document.getElementById('uploadBtn');
    btn.textContent = 'Uploading…'; btn.disabled = true;

    const formData = new FormData();
    formData.append('photo', uploadFile);

    try {
        const res = await fetch(`${API}/api/students/${uploadingStudentId}/photo`, {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword },
            body: formData
        });
        if (!res.ok) { alert('Upload failed.'); return; }
        const data = await res.json();
        const idx  = allStudents.findIndex(s => s.id === uploadingStudentId);
        if (idx !== -1) allStudents[idx] = { ...allStudents[idx], ...data.student };
        const d = discrepancies.find(d => d.id === uploadingStudentId);
        if (d) { d.resolved = true; d.resolution = 'Photo manually replaced'; }
        document.getElementById('uploadModal').style.display = 'none';
        renderTable(); renderDiscrepancies(); updateFixitBadge();
    } catch {
        alert('Upload error. Check server.');
    } finally {
        btn.textContent = 'Upload Photo'; btn.disabled = false;
    }
}

// ── Utility ────────────────────────────────────────────────────────────────
function toTitleCase(str) {
    return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Enter key in edit modal
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('editNameModal').style.display === 'flex') saveNameEdit();
    if (e.key === 'Escape') {
        closeEditModal(); closeUploadModal();
    }
});
