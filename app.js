/* app.js — Static mode + Search + LocalStorage Hide */

// ── Google Sheets Backend ─────────────────────────────────────────────────────
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyfPTgyu_tAeUqe5Cvl2N0nNQCCXldBVrhGWhBB_3Ek56dgW-xU8HDaXrs6x5ihtFNZ7A/exec';

// ── Base path detection ───────────────────────────────────────────────────
const BASE = (() => {
    const src = (document.currentScript?.src || '');
    const base = src.replace(/\/app\.js.*$/, '');
    return base || window.location.origin;
})();

// ── LocalStorage helpers ──────────────────────────────────────────────────
const LS_HIDDEN = 'sop_hidden_ids';
const LS_EDITS  = 'student_edits';
const LS_VOTES  = 'sessionVotes';

function getHiddenIds() {
    try { return JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]'); }
    catch { return []; }
}
function getStudentEdits() {
    try { return JSON.parse(localStorage.getItem(LS_EDITS) || '{}'); }
    catch { return {}; }
}
function getSessionVotes() {
    try { return JSON.parse(sessionStorage.getItem(LS_VOTES) || '{}'); }
    catch { return {}; }
}
function saveSessionVote(id, vote) {
    const votes = getSessionVotes();
    votes[id] = vote;
    sessionStorage.setItem(LS_VOTES, JSON.stringify(votes));
}

// ── Student store ─────────────────────────────────────────────────────────
let ALL_STUDENTS_ORIGINAL = []; // untouched JSON data
let ALL_STUDENTS_RAW      = []; // with local edits applied (for search)
let ALL_STUDENTS          = []; // active only (for game)
let loaded = false;

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('dismissBanner').addEventListener('click', () => {
        document.getElementById('privacyBanner').classList.add('hidden');
    });

    // Check if user already entered name THIS session (clears on refresh)
    const username = sessionStorage.getItem('username');
    const modal = document.getElementById('welcomeModal');
    if (username) {
        modal.classList.add('hidden');  // same session, skip modal
    }
    // No username in session = show modal on every fresh load

    await loadAllStudents();
});

function startApp() {
    const input = document.getElementById('usernameInput').value.trim();
    if (!input) {
        document.getElementById('usernameInput').focus();
        document.getElementById('usernameInput').style.borderColor = 'rgba(255,77,109,0.6)';
        return;
    }
    sessionStorage.setItem('username', input);
    document.getElementById('welcomeModal').classList.add('hidden');
}

async function loadAllStudents() {
    try {
        const res = await fetch(`${BASE}/data/students.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        ALL_STUDENTS_ORIGINAL = [...raw];
        applyEdits();
        refreshActivePool();
        loaded = true;
        updateHomeStats();

        // Fix admin link so it always resolves correctly
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) adminLink.href = BASE + '/admin.html';
    } catch (err) {
        console.error('Failed to load students.json:', err);
        document.getElementById('statTotal').textContent = '!';
        document.getElementById('boysCount').textContent  = 'Load error';
        document.getElementById('girlsCount').textContent = 'Load error';
    }
}

function applyEdits() {
    const edits = getStudentEdits();
    ALL_STUDENTS_RAW = ALL_STUDENTS_ORIGINAL.map(s => {
        if (edits[s.id]) {
            return { ...s, name: edits[s.id].name || s.name, photo: edits[s.id].photo || s.photo };
        }
        return s;
    });
    refreshActivePool();
}

function getVisibleStudents() {
    const hiddenIds = getHiddenIds();
    return ALL_STUDENTS_RAW.filter(s => 
        s.active !== false && !hiddenIds.includes(s.id)
    );
}

function refreshActivePool() {
    ALL_STUDENTS = getVisibleStudents();
}

function updateHomeStats() {
    const male   = ALL_STUDENTS.filter(s => s.gender === 'Male').length;
    const female = ALL_STUDENTS.filter(s => s.gender === 'Female').length;
    document.getElementById('statTotal').textContent  = ALL_STUDENTS.length;
    document.getElementById('statMale').textContent   = male;
    document.getElementById('statFemale').textContent = female;
    document.getElementById('boysCount').textContent  = `${male} students`;
    document.getElementById('girlsCount').textContent = `${female} students`;
}

// ── Real-time Sync ────────────────────────────────────────────────────────
window.addEventListener('storage', e => {
    if (e.key === LS_HIDDEN || e.key === LS_EDITS) {
        if (e.key === LS_EDITS) {
            applyEdits();
        } else {
            refreshActivePool();
        }
        
        updateHomeStats();
        
        // Refresh search if active
        if (document.getElementById('mainSearch').value.trim()) {
            handleMainSearch();
        }
        
        // Refresh game if active
        if (document.getElementById('gameScreen').classList.contains('active')) {
            const hiddenIds = getHiddenIds();
            pool = pool.filter(s => !hiddenIds.includes(s.id));
            
            // If current student was just hidden, move to next instantly
            if (currentStudent && hiddenIds.includes(currentStudent.id)) {
                loadNext();
            } else if (currentStudent && e.key === LS_EDITS) {
                // if we edited the current student, re-render them
                const updated = ALL_STUDENTS_RAW.find(s => s.id === currentStudent.id);
                if (updated) {
                    currentStudent = updated;
                    renderStudent(currentStudent);
                }
            }
        }
    }
});


// ── Search ────────────────────────────────────────────────────────────────
function handleMainSearch() {
    const input   = document.getElementById('mainSearch');
    const query   = input.value.trim();
    const results = document.getElementById('searchResults');
    const clearBtn = document.getElementById('clearMainSearch');

    clearBtn.style.display = query ? 'flex' : 'none';

    if (!query || !loaded) {
        results.style.display = 'none';
        return;
    }

    const q = query.toLowerCase();
    const visibleStudents = getVisibleStudents();
    const matches = visibleStudents.filter(s =>
        s.name.toLowerCase().includes(q)
    ).slice(0, 8);

    if (!matches.length) {
        results.innerHTML = `<div class="search-no-result">No student found matching "<strong>${query}</strong>"</div>`;
        results.style.display = 'block';
        return;
    }

    results.style.display = 'block';
    results.innerHTML = matches.map(s => {
        const photoUrl = s.photo ? `${BASE}/data/${s.photo}` : '';

        return `<div class="search-result-card">
          <div class="result-photo-wrap">
            ${photoUrl
              ? `<img src="${photoUrl}" alt="${s.name}" class="result-photo" />`
              : `<div class="result-photo-placeholder">👤</div>`}
          </div>
          <div class="result-info">
            <div class="result-name">${toTitleCase(s.name)}</div>
            <div class="result-meta">
              <span class="result-gender ${s.gender.toLowerCase()}">${s.gender}</span>
              <span class="result-id">SL#${String(s.id).padStart(5,'0')}</span>
            </div>
            <span class="result-status status-available">✅ Available for Vote</span>
          </div>
        </div>`;
    }).join('');
}

function clearMainSearch() {
    document.getElementById('mainSearch').value = '';
    document.getElementById('clearMainSearch').style.display = 'none';
    document.getElementById('searchResults').style.display   = 'none';
    document.getElementById('mainSearch').focus();
}

// Close search results when clicking outside
document.addEventListener('click', e => {
    const wrap = document.getElementById('searchSection');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('searchResults').style.display = 'none';
    }
});

// ── Game State ─────────────────────────────────────────────────────────────
let currentGender  = null;
let currentStudent = null;
let pool           = [];
let shownIds       = [];
let smashCount     = 0;
let passCount      = 0;
let crackCount     = 0;
let sessionRated   = 0;
let isAnimating    = false;

// ── Track Selection ────────────────────────────────────────────────────────
function selectTrack(gender) {
    if (!loaded) return;
    currentGender = gender;
    smashCount = 0; passCount = 0; crackCount = 0; sessionRated = 0; shownIds = [];
    updateCounters();

    // Refresh pool in case admin changed hidden list
    refreshActivePool();

    const votes = getSessionVotes();
    pool = ALL_STUDENTS
        .filter(s => s.gender === gender && !votes[s.id])
        .sort(() => Math.random() - 0.5);

    document.getElementById('trackScreen').classList.remove('active');
    const gs = document.getElementById('gameScreen');
    gs.style.display = 'flex';
    gs.classList.add('active');

    const badge = document.getElementById('gameBadge');
    badge.textContent = gender === 'Male' ? 'Boys' : 'Girls';
    badge.className   = 'game-track-badge ' + (gender === 'Male' ? 'boys-track' : 'girls-track');

    loadNext();
}

function goHome() {
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('resultsScreen').style.display = 'none';
    document.getElementById('trackScreen').classList.add('active');
    refreshActivePool();
    updateHomeStats();
}

function resetAndRestart() {
    shownIds = [];
    const votes = getSessionVotes();
    pool = ALL_STUDENTS
        .filter(s => s.gender === currentGender && !votes[s.id])
        .sort(() => Math.random() - 0.5);
    loadNext();
}

// ── Card Loading ───────────────────────────────────────────────────────────
function loadNext() {
    if (isAnimating) return;
    showLoading();

    let candidate = pool.find(s => !shownIds.includes(s.id));
    if (!candidate) {
        if (!pool.length) { showEmpty(); return; }
        shownIds = [];
        pool = pool.sort(() => Math.random() - 0.5);
        candidate = pool[0];
    }
    if (!candidate) { showEmpty(); return; }

    currentStudent = candidate;
    shownIds.push(candidate.id);
    setTimeout(() => renderStudent(candidate), 80);
}

function renderStudent(student) {
    const card  = document.getElementById('studentCard');
    const photo = document.getElementById('studentPhoto');
    const name  = document.getElementById('studentName');
    const badge = document.getElementById('studentGenderBadge');

    name.textContent  = toTitleCase(student.name);
    badge.textContent = student.gender;
    badge.className   = 'student-badge ' + (student.gender === 'Male' ? 'male' : 'female');

    if (student.photo) {
        photo.src = `${BASE}/data/${student.photo}`;
        photo.alt = student.name;
        photo.onerror = () => {
            photo.src = '';
            photo.parentElement.style.background = '#1a1a26';
        };
    } else {
        photo.src = '';
        card.querySelector('.card-photo-wrap').style.background = '#1a1a26';
    }

    hideLoading();
    card.style.display = 'flex';
    card.classList.add('fade-up');
    card.addEventListener('animationend', () => card.classList.remove('fade-up'), { once: true });
}

// ── Vote Handling ──────────────────────────────────────────────────────────
function handleVote(type) {
    if (isAnimating || !currentStudent) return;
    isAnimating = true;

    const card    = document.getElementById('studentCard');
    const overlay = document.getElementById('voteOverlay');

    if (type === 'smash') smashCount++;
    else if (type === 'crack') crackCount++;
    else                  passCount++;
    sessionRated++;
    
    saveSessionVote(currentStudent.id, type);
    updateCounters();

    if (type === 'crack') card.classList.add('fade-up');
    else card.classList.add(type === 'smash' ? 'swipe-right' : 'swipe-left');
    
    overlay.className = `vote-overlay flash-${type}`;
    setTimeout(() => { overlay.className = 'vote-overlay'; }, 400);

    setTimeout(() => {
        card.className     = 'student-card';
        card.style.display = 'none';
        isAnimating        = false;
        loadNext();
    }, 380);
}

// ── UI Helpers ─────────────────────────────────────────────────────────────
function showLoading() {
    document.getElementById('loadingCard').style.display = 'flex';
    document.getElementById('studentCard').style.display = 'none';
    document.getElementById('emptyCard').style.display   = 'none';
    document.getElementById('actionButtons').style.opacity      = '0.4';
    document.getElementById('actionButtons').style.pointerEvents = 'none';
}
function hideLoading() {
    document.getElementById('loadingCard').style.display  = 'none';
    document.getElementById('emptyCard').style.display    = 'none';
    document.getElementById('actionButtons').style.opacity      = '1';
    document.getElementById('actionButtons').style.pointerEvents = 'auto';
}
function showEmpty() {
    document.getElementById('loadingCard').style.display  = 'none';
    document.getElementById('studentCard').style.display  = 'none';
    document.getElementById('emptyCard').style.display    = 'flex';
    document.getElementById('actionButtons').style.opacity      = '0.3';
    document.getElementById('actionButtons').style.pointerEvents = 'none';
}

function updateCounters() {
    document.getElementById('smashCount').textContent   = smashCount;
    const crackEl = document.getElementById('crackCount');
    if (crackEl) crackEl.textContent = crackCount;
    document.getElementById('passCount').textContent    = passCount;
    document.getElementById('sessionCount').textContent = sessionRated;
}
function toTitleCase(str) {
    return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Results Dashboard ──────────────────────────────────────────────────────
async function finishGame() {
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('gameScreen').style.display = 'none';

    const username = sessionStorage.getItem('username') || 'Player';
    const votes = getSessionVotes();
    const lists = { smash: [], crack: [], pass: [] };

    for (const [idStr, vote] of Object.entries(votes)) {
        const id = parseInt(idStr);
        const student = ALL_STUDENTS_RAW.find(s => s.id === id);
        if (student && lists[vote]) lists[vote].push(student);
    }

    // Show results screen immediately — don't wait for upload
    const rs = document.getElementById('resultsScreen');
    rs.style.display = 'block';
    document.getElementById('resultsTitle').textContent = `Game Summary for ${username}`;

    const renderCard = s => {
        const photo = s.photo ? `${BASE}/data/${s.photo}` : '';
        return `
            <div class="result-card-small">
              ${photo
                ? `<img src="${photo}" />`
                : `<div style="width:40px;height:40px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;flex-shrink:0;">👤</div>`}
              <div class="res-name" title="${s.name}">${toTitleCase(s.name)}</div>
            </div>
        `;
    };

    document.getElementById('listSmashed').innerHTML = lists.smash.map(renderCard).join('') || '<p style="color:#666;text-align:center;">None</p>';
    document.getElementById('listCracked').innerHTML = lists.crack.map(renderCard).join('') || '<p style="color:#666;text-align:center;">None</p>';
    document.getElementById('listPassed').innerHTML  = lists.pass.map(renderCard).join('')  || '<p style="color:#666;text-align:center;">None</p>';

    // Silent background upload to Google Sheets
    fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            username,
            timestamp: new Date().toISOString(),
            smashed: lists.smash.map(s => toTitleCase(s.name)),
            cracked: lists.crack.map(s => toTitleCase(s.name)),
            passed:  lists.pass.map(s  => toTitleCase(s.name)),
        })
    }).catch(e => console.warn('Sheet upload failed:', e));
}

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (!document.getElementById('gameScreen').classList.contains('active')) return;
    if (e.key === 'ArrowRight' || e.key === 's') handleVote('smash');
    if (e.key === 'ArrowLeft'  || e.key === 'p') handleVote('pass');
    if (e.key === 'ArrowUp'    || e.key === 'c') handleVote('crack');
    if (e.key === 'ArrowDown'  || e.key === ' ') { e.preventDefault(); loadNext(); }
    if (e.key === 'Escape') goHome();
});
