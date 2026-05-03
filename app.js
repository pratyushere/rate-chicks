/* app.js — Static mode (works on GitHub Pages, no server needed) */

// ── Detect base path (works both on localhost and GitHub Pages subpath) ──
const BASE = (() => {
    // If served from GitHub Pages like pratyushere.github.io/rate-chicks/
    // we need to prefix data URLs with the repo subpath.
    // document.currentScript gives us the path of this script file.
    const src = (document.currentScript?.src || '');
    const base = src.replace(/\/app\.js.*$/, '');
    return base || window.location.origin;
})();

// ── In-memory student store ───────────────────────────────────────────────
let ALL_STUDENTS = [];
let loaded = false;

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('dismissBanner').addEventListener('click', () => {
        document.getElementById('privacyBanner').classList.add('hidden');
    });
    await loadAllStudents();
});

async function loadAllStudents() {
    try {
        const res = await fetch(`${BASE}/data/students.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ALL_STUDENTS = await res.json();
        // Only active students
        ALL_STUDENTS = ALL_STUDENTS.filter(s => s.active !== false);
        loaded = true;
        updateHomeStats();

        // Fix admin link using the same base as app.js — works on GitHub Pages subpaths
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) adminLink.href = BASE + '/admin.html';
    } catch (err) {
        console.error('Failed to load students.json:', err);
        document.getElementById('statTotal').textContent = '!';
        document.getElementById('boysCount').textContent = 'Load error';
        document.getElementById('girlsCount').textContent = 'Load error';
    }
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

// ── Game State ─────────────────────────────────────────────────────────────
let currentGender  = null;
let currentStudent = null;
let pool           = [];
let shownIds       = [];
let smashCount     = 0;
let passCount      = 0;
let sessionRated   = 0;
let isAnimating    = false;

// ── Track Selection ────────────────────────────────────────────────────────
function selectTrack(gender) {
    if (!loaded) return;
    currentGender = gender;
    smashCount = 0; passCount = 0; sessionRated = 0; shownIds = [];
    updateCounters();

    // Build shuffled pool for this gender
    pool = ALL_STUDENTS
        .filter(s => s.gender === gender)
        .sort(() => Math.random() - 0.5);

    // Switch screens
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
    document.getElementById('trackScreen').classList.add('active');
}

function resetAndRestart() {
    shownIds = [];
    pool = pool.sort(() => Math.random() - 0.5); // re-shuffle
    loadNext();
}

// ── Card Loading ───────────────────────────────────────────────────────────
function loadNext() {
    if (isAnimating) return;
    showLoading();

    // Get a student not yet shown
    let candidate = pool.find(s => !shownIds.includes(s.id));

    if (!candidate) {
        // All shown — reset pool
        if (pool.length === 0) { showEmpty(); return; }
        shownIds = [];
        pool = pool.sort(() => Math.random() - 0.5);
        candidate = pool[0];
    }

    if (!candidate) { showEmpty(); return; }

    currentStudent = candidate;
    shownIds.push(candidate.id);

    // Small delay to feel responsive
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
        const photoUrl = `${BASE}/data/${student.photo}`;
        photo.src = photoUrl;
        photo.alt = student.name;
        photo.onerror = () => {
            photo.src = '';
            photo.parentElement.style.background = 'var(--surface2)';
        };
    } else {
        photo.src = '';
        card.querySelector('.card-photo-wrap').style.background = 'var(--surface2)';
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
    else                  passCount++;
    sessionRated++;
    updateCounters();

    card.classList.add(type === 'smash' ? 'swipe-right' : 'swipe-left');

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
    document.getElementById('passCount').textContent    = passCount;
    document.getElementById('sessionCount').textContent = sessionRated;
}

function toTitleCase(str) {
    return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (!document.getElementById('gameScreen').classList.contains('active')) return;
    if (e.key === 'ArrowRight' || e.key === 's') handleVote('smash');
    if (e.key === 'ArrowLeft'  || e.key === 'p') handleVote('pass');
    if (e.key === 'ArrowDown'  || e.key === ' ') { e.preventDefault(); loadNext(); }
    if (e.key === 'Escape') goHome();
});
