/* app.js — Main game logic */

const API = 'http://localhost:3500';

let currentGender = null;
let currentStudent = null;
let shownIds = [];
let smashCount = 0;
let passCount  = 0;
let sessionRated = 0;
let isAnimating = false;

// ── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    loadStats();

    const banner = document.getElementById('privacyBanner');
    document.getElementById('dismissBanner').addEventListener('click', () => {
        banner.classList.add('hidden');
    });
});

async function loadStats() {
    try {
        const res = await fetch(`${API}/api/stats`);
        const data = await res.json();
        document.getElementById('statTotal').textContent  = data.active;
        document.getElementById('statMale').textContent   = data.male;
        document.getElementById('statFemale').textContent = data.female;
        document.getElementById('boysCount').textContent   = `${data.male} students`;
        document.getElementById('girlsCount').textContent  = `${data.female} students`;
    } catch {
        document.getElementById('statTotal').textContent = '?';
    }
}

// ── Track Selection ───────────────────────────────────────────────
function selectTrack(gender) {
    currentGender = gender;
    shownIds = [];
    smashCount = 0; passCount = 0; sessionRated = 0;
    updateCounters();

    // Switch screens
    document.getElementById('trackScreen').classList.remove('active');
    const gameScreen = document.getElementById('gameScreen');
    gameScreen.style.display = 'flex';
    gameScreen.classList.add('active');

    // Set badge
    const badge = document.getElementById('gameBadge');
    badge.textContent = gender === 'Male' ? 'Boys' : 'Girls';
    badge.className = 'game-track-badge ' + (gender === 'Male' ? 'boys-track' : 'girls-track');

    loadNext();
}

function goHome() {
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('trackScreen').classList.add('active');
    loadStats();
}

function resetAndRestart() {
    shownIds = [];
    loadNext();
}

// ── Card Loading ──────────────────────────────────────────────────
async function loadNext() {
    if (isAnimating) return;
    showLoading();

    try {
        const excludeParam = shownIds.length ? `&exclude=${shownIds.join(',')}` : '';
        const res = await fetch(`${API}/api/random?gender=${currentGender}${excludeParam}`);

        if (res.status === 404) {
            showEmpty();
            return;
        }

        const student = await res.json();
        currentStudent = student;
        shownIds.push(student.id);
        if (shownIds.length > 50) shownIds = shownIds.slice(-50); // cap memory

        renderStudent(student);
    } catch (err) {
        console.error('Failed to load student:', err);
        showEmpty();
    }
}

function renderStudent(student) {
    const card = document.getElementById('studentCard');
    const photo = document.getElementById('studentPhoto');
    const name  = document.getElementById('studentName');
    const badge = document.getElementById('studentGenderBadge');

    // Set content
    name.textContent  = toTitleCase(student.name);
    badge.textContent = student.gender;
    badge.className   = 'student-badge ' + (student.gender === 'Male' ? 'male' : 'female');

    if (student.photo) {
        photo.src = `${API}/data/${student.photo}`;
        photo.alt = student.name;
        photo.onerror = () => { photo.src = ''; photo.parentElement.style.background = 'var(--surface2)'; };
    } else {
        photo.src = '';
        card.querySelector('.card-photo-wrap').style.background = `var(--surface2)`;
    }

    // Show card
    hideLoading();
    card.style.display = 'flex';
    card.classList.add('fade-up');
    card.addEventListener('animationend', () => card.classList.remove('fade-up'), { once: true });
}

// ── Vote Handling ─────────────────────────────────────────────────
function handleVote(type) {
    if (isAnimating || !currentStudent) return;
    isAnimating = true;

    const card = document.getElementById('studentCard');
    const overlay = document.getElementById('voteOverlay');

    // Update counters
    if (type === 'smash') { smashCount++; }
    else                  { passCount++; }
    sessionRated++;
    updateCounters();

    // Animate card out
    card.classList.add(type === 'smash' ? 'swipe-right' : 'swipe-left');

    // Flash overlay
    overlay.className = `vote-overlay flash-${type}`;
    setTimeout(() => { overlay.className = 'vote-overlay'; }, 400);

    // Load next after animation
    setTimeout(() => {
        card.className = 'student-card';
        card.style.display = 'none';
        isAnimating = false;
        loadNext();
    }, 380);
}

// ── UI Helpers ────────────────────────────────────────────────────
function showLoading() {
    document.getElementById('loadingCard').style.display = 'flex';
    document.getElementById('studentCard').style.display = 'none';
    document.getElementById('emptyCard').style.display   = 'none';
    document.getElementById('actionButtons').style.opacity = '0.4';
    document.getElementById('actionButtons').style.pointerEvents = 'none';
}

function hideLoading() {
    document.getElementById('loadingCard').style.display  = 'none';
    document.getElementById('emptyCard').style.display    = 'none';
    document.getElementById('actionButtons').style.opacity = '1';
    document.getElementById('actionButtons').style.pointerEvents = 'auto';
}

function showEmpty() {
    document.getElementById('loadingCard').style.display  = 'none';
    document.getElementById('studentCard').style.display  = 'none';
    document.getElementById('emptyCard').style.display    = 'flex';
    document.getElementById('actionButtons').style.opacity = '0.3';
    document.getElementById('actionButtons').style.pointerEvents = 'none';
}

function updateCounters() {
    document.getElementById('smashCount').textContent  = smashCount;
    document.getElementById('passCount').textContent   = passCount;
    document.getElementById('sessionCount').textContent = sessionRated;
}

function toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Keyboard Support ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (!document.getElementById('gameScreen').classList.contains('active')) return;
    if (e.key === 'ArrowRight' || e.key === 's') handleVote('smash');
    if (e.key === 'ArrowLeft'  || e.key === 'p') handleVote('pass');
    if (e.key === 'ArrowDown'  || e.key === ' ') { e.preventDefault(); loadNext(); }
    if (e.key === 'Escape') goHome();
});
