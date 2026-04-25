/**
 * @file app.js
 * @description VoteWise India — Frontend Application Logic
 * Navigation, Firebase init, quiz engine, AI chat, translation,
 * state/parliament data renderers, and scroll-reveal animations.
 */

'use strict';

/* ── Utilities ──────────────────────────────────────────── */
/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - Raw string
 * @returns {string} HTML-safe string
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Converts basic markdown (bold, lists) to HTML for chat messages.
 * @param {string} text - Markdown text
 * @returns {string} HTML string
 */
function mdToHtml(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^[•-] (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
}

/* ── Navigation ─────────────────────────────────────────── */
const navBtns = document.querySelectorAll('.nav-btn');
const panels = document.querySelectorAll('.panel');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.panel;
    navBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    document.getElementById('panel-' + target).classList.add('active');

    if (target === 'quiz' && !quizLoaded) initQuiz();
    if (target === 'parliament' && !parliamentLoaded) loadParliament();
    if (target === 'states' && !statesLoaded) loadStates();
    if (target === 'president' && !presidentLoaded) loadPresident();
    if (target === 'dates' && !datesLoaded) loadDates();
    if (target === 'updates' && !annLoaded) loadAnnouncements();
    if (target === 'how-to-vote' && !stepsLoaded) loadSteps();
    if (target === 'register' && !stepsLoaded) loadSteps();

    // GA4 event via Firebase Analytics
    if (analyticsInstance) logEvent(analyticsInstance, 'tab_view', { tab_name: target });
  });
});

/* ── Firebase Modular SDK Imports ────────────────────────── */
import { initializeApp }                                         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithRedirect,
         getRedirectResult, signOut, onAuthStateChanged }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getAnalytics, logEvent }                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js';

/* ── Firebase Init ───────────────────────────────────────── */
let auth = null, analyticsInstance = null;

async function initFirebase() {
  try {
    const res = await fetch('/api/config');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    if (!data.firebase.apiKey) return;

    const f = data.firebase;
    if (!f.authDomain || !f.projectId) {
      console.warn('Firebase: set FIREBASE_AUTH_DOMAIN and FIREBASE_PROJECT_ID in server .env');
      return;
    }

    const firebaseApp = initializeApp(f);
    auth = getAuth(firebaseApp);

    if (data.features.analytics && f.measurementId) {
      analyticsInstance = getAnalytics(firebaseApp);
    }

    onAuthStateChanged(auth, user => {
      const btn = document.getElementById('auth-btn');
      if (user) {
        btn.textContent = 'Hi, ' + user.displayName.split(' ')[0] + ' ✓';
        btn.style.background = 'rgba(19,136,8,0.15)';
        btn.style.borderColor = '#138808';
        btn.style.color = '#4CAF50';
      } else {
        btn.textContent = currentLang === 'hi' ? 'Google से साइन इन करें' : 'Sign in with Google';
        btn.style.background = 'var(--saffron-lt)';
        btn.style.borderColor = 'var(--saffron)';
        btn.style.color = 'var(--saffron)';
      }
    });

    // Catch result when user returns from Google redirect
    getRedirectResult(auth).then(result => {
      if (result && result.user) {
        console.log('Signed in via redirect:', result.user.displayName);
      }
    }).catch(e => {
      if (e.code !== 'auth/no-auth-event') {
        console.error('Redirect result:', e.code, e.message);
      }
    });

  } catch (e) { console.warn('Firebase init:', e.message); }
}

function handleAuth() {
  if (!auth) {
    const btn = document.getElementById('auth-btn');
    btn.textContent = 'Sign-in unavailable';
    setTimeout(() => {
      btn.textContent = currentLang === 'hi' ? 'Google से साइन इन करें' : 'Sign in with Google';
    }, 2000);
    return;
  }
  if (auth.currentUser) {
    signOut(auth);
  } else {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider).catch(e => {
      console.error('Auth redirect error:', e.code, e.message);
    });
  }
}

/**
 * User-visible label for Google sign-in errors (see Firebase console if unclear).
 * @param {object} e - Firebase error with optional `code` and `message`
 * @returns {string}
 */
function authErrorButtonLabel(e) {
  const code = e && e.code;
  const hi = currentLang === 'hi';
  if (code === 'auth/unauthorized-domain') {
    return hi
      ? 'यह डोमेन Firebase में जोड़ें'
      : 'Add this site’s domain in Firebase (Auth → Settings → Authorized domains)';
  }
  if (code === 'auth/operation-not-allowed') {
    return hi
      ? 'Firebase में Google साइन-इन चालू करें'
      : 'Enable Google in Firebase: Authentication → Sign-in method → Google';
  }
  if (code === 'auth/popup-blocked') {
    return hi ? 'पॉप-अप अनुमति दें' : 'Allow pop-ups to sign in';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return hi ? 'साइन-इन रद्द' : 'Sign-in cancelled';
  }
  if (code === 'auth/network-request-failed') {
    return hi ? 'नेटवर्क त्रुटि' : 'Network error — check connection';
  }
  if (code === 'auth/invalid-api-key' || (e.message && e.message.toLowerCase().includes('api key'))) {
    return hi ? 'FIREBASE_API_KEY जांचें' : 'Invalid API key — check .env and redeploy';
  }
  if (code && String(code).startsWith('auth/')) {
    return (hi ? 'त्रुटि: ' : 'Error: ') + code;
  }
  return hi ? 'साइन-इन विफल — F12 कंसोल देखें' : 'Sign-in failed — see browser console (F12)';
}

/* ── Load Election Data ──────────────────────────────────── */
async function loadHomeData() {
  try {
    const res = await fetch('/api/election');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);

    // Facts grid (reveal class + data-count for count-up animation)
    document.getElementById('facts-grid').innerHTML = data.keyFacts.map((f, i) => `
      <div class="fact-card reveal" role="listitem" style="transition-delay:${i * 70}ms">
        <div class="fact-val" data-count="${escHtml(f.value)}">${escHtml(f.value)}</div>
        <div class="fact-lbl">${f.icon} ${escHtml(f.label)}</div>
      </div>
    `).join('');

    // Election types
    document.getElementById('election-types').innerHTML = data.electionTypes.map((t, i) => `
      <div class="type-card reveal" role="listitem" style="transition-delay:${i * 60}ms">
        <div class="type-name">${escHtml(t.name)}</div>
        <div class="type-desc">${escHtml(t.desc)}</div>
        <div class="type-meta">Frequency: ${escHtml(t.frequency)} · Next: ${escHtml(t.nextDue)}</div>
      </div>
    `).join('');

    observeReveals();
    animateCountUps();
  } catch (e) { console.error('loadHomeData:', e); }
}

/* ── Steps ───────────────────────────────────────────────── */
let stepsLoaded = false;

async function loadSteps() {
  if (stepsLoaded) return;
  try {
    const res = await fetch('/api/steps');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    stepsLoaded = true;

    document.getElementById('voting-steps').innerHTML = data.votingSteps.map(s => `
      <article class="step-card reveal" role="listitem" aria-label="Step ${s.step}: ${escHtml(s.title)}" style="transition-delay:${s.step * 50}ms">
        <div>
          <div class="step-num" aria-hidden="true">${s.step}</div>
          <div class="step-icon" aria-hidden="true" style="margin-top:0.4rem;">${s.icon}</div>
        </div>
        <div>
          <div class="step-title">${escHtml(s.title)}</div>
          <div class="step-desc">${escHtml(s.description)}</div>
        </div>
      </article>
    `).join('');

    document.getElementById('reg-steps').innerHTML = data.registrationSteps.map(s => `
      <article class="step-card reveal" role="listitem" aria-label="Step ${s.step}: ${escHtml(s.title)}" style="transition-delay:${s.step * 50}ms">
        <div>
          <div class="step-num" aria-hidden="true">${s.step}</div>
        </div>
        <div>
          <div class="step-title">${escHtml(s.title)}</div>
          <div class="step-desc">${escHtml(s.desc)}</div>
        </div>
      </article>
    `).join('');
    observeReveals();
    attachStepHoverTracking();
  } catch (e) { console.error('loadSteps:', e); }
}

/* ── Motion helpers: scroll-reveal, count-up, hover glow ──── */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Observes .reveal elements and fades them in once they enter the viewport.
 * Idempotent — safe to call after each async render.
 */
const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 })
  : null;

function observeReveals() {
  if (prefersReducedMotion || !revealObserver) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    return;
  }
  document.querySelectorAll('.reveal:not(.in)').forEach(el => revealObserver.observe(el));
}

/**
 * Animates numeric fact values from 0 up to their target.
 * Preserves suffixes (%, Cr, years, seats) and decimals. Skips under reduced-motion.
 */
function animateCountUps() {
  if (prefersReducedMotion) return;
  document.querySelectorAll('.fact-val[data-count]').forEach(el => {
    const raw = el.dataset.count;
    const match = raw.match(/^([\d,.]+)(.*)$/);
    if (!match) return;
    const target = parseFloat(match[1].replace(/,/g, ''));
    if (!isFinite(target) || target === 0) return;
    const suffix = match[2];
    const hasDecimal = match[1].includes('.');
    const decimals = hasDecimal ? (match[1].split('.')[1] || '').length : 0;
    const duration = 1200;
    const start = performance.now();
    el.textContent = '0' + suffix;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = target * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = raw;
    }
    requestAnimationFrame(tick);
  });
}

/** Tracks pointer position on step cards for radial hover glow. */
function attachStepHoverTracking() {
  if (prefersReducedMotion) return;
  document.querySelectorAll('.step-card').forEach(card => {
    if (card.dataset.hoverBound) return;
    card.dataset.hoverBound = '1';
    card.addEventListener('pointermove', e => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
      card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%');
    });
  });
}

/* ── Quiz Engine ─────────────────────────────────────────── */
let quizLoaded = false;
let questions = [];
let currentQ = 0;
let selectedAnswers = [];
const SESSION_ID = Math.random().toString(36).slice(2);

async function initQuiz() {
  if (quizLoaded) {
    renderQuestion();
    return;
  }

  try {
    const res = await fetch('/api/quiz');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    questions = data.questions;
    selectedAnswers = new Array(questions.length).fill(-1);
    quizLoaded = true;
    renderQuestion();

  } catch (e) {
    console.error('Quiz load error:', e);
    document.getElementById('quiz-container').innerHTML = '<div class="error-state">Failed to load quiz. Please refresh the page.</div>';
  }
}

function renderQuestion() {
  const q = questions[currentQ];
  const pct = Math.round((currentQ / questions.length) * 100);
  const container = document.getElementById('quiz-container');
  const sel = selectedAnswers[currentQ];

  container.innerHTML = `
    <div class="quiz-progress">
      <div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="progress-text">${currentQ + 1} / ${questions.length}</span>
    </div>
    <div class="quiz-question" id="q-text">${escHtml(q.q)}</div>
    <div class="quiz-options" id="quiz-options" role="group" aria-labelledby="q-text">
      ${q.options.map((opt, i) => `
        <button class="quiz-option${sel === i ? ' selected' : sel !== -1 ? ' dimmed' : ''}"
          data-index="${i}"
          aria-label="Option ${i + 1}: ${escHtml(opt)}"
          aria-pressed="${sel === i}">
          ${String.fromCharCode(65 + i)}. ${escHtml(opt)}
        </button>
      `).join('')}
    </div>
    <div class="quiz-nav">
      <span style="font-family:var(--font-m);font-size:0.75rem;color:var(--text-3);">
        ${sel !== -1 ? '✓ Answer saved — click Next' : 'Select an answer'}
      </span>
      <button class="btn btn-primary" id="next-btn"
        ${sel === -1 ? 'disabled' : ''}
        aria-label="${currentQ === questions.length - 1 ? 'See results' : 'Next question'}">
        ${currentQ === questions.length - 1 ? 'See Results →' : 'Next →'}
      </button>
    </div>
  `;

  // Attach click handlers using event delegation
  const optionsContainer = document.getElementById('quiz-options');
  if (optionsContainer) {
    optionsContainer.addEventListener('click', handleOptionClick);
  }
  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (selectedAnswers[currentQ] !== -1) nextQuestion();
    });
  }
}

function handleOptionClick(e) {
  const button = e.target.closest('.quiz-option');
  if (!button) return;

  const index = parseInt(button.dataset.index, 10);
  if (isNaN(index)) return;


  selectAnswer(index);
}

function selectAnswer(idx) {
  selectedAnswers[currentQ] = idx;

  renderQuestion();
}

function nextQuestion() {
  if (selectedAnswers[currentQ] === -1) return;
  currentQ++;
  if (currentQ >= questions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

async function showResults() {
  const container = document.getElementById('quiz-container');
  container.innerHTML = '<div class="loading-state">Calculating your results…</div>';

  try {
    const res = await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: selectedAnswers, sessionId: SESSION_ID }),
    });
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);

    const score = data.score;
    const total = data.total;
    const pct = data.percentage;
    const badge = pct >= 80 ? ['🏆 Election Expert!', '#FFD700', 'rgba(255,215,0,0.15)']
      : pct >= 60 ? ['👍 Good Knowledge!', '#138808', 'rgba(19,136,8,0.15)']
        : ['📚 Keep Learning!', '#FF6B00', 'rgba(255,107,0,0.15)'];

    container.innerHTML = `
      <div class="quiz-result">
        <div class="result-score">${score}/${total}</div>
        <div class="result-label">You scored ${pct}%</div>
        <div class="result-badge" style="background:${badge[2]};color:${badge[1]};border:1px solid ${badge[1]};">${badge[0]}</div>
        <div class="quiz-review">
          ${data.results.map((r, i) => `
            <div class="review-item ${r.isCorrect ? 'review-correct' : 'review-wrong'}">
              <div class="review-q">${i + 1}. ${escHtml(r.question)}</div>
              <div class="review-a">
                ${r.isCorrect ? '✅ Correct' : '❌ Wrong'} —
                Your answer: <strong>${escHtml(questions[i].options[r.yourAnswer])}</strong>
                ${!r.isCorrect ? ` · Correct: <strong>${escHtml(questions[i].options[r.correct])}</strong>` : ''}
              </div>
              <div class="review-explain">${escHtml(r.explain)}</div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary" id="retake-btn" style="margin-top:1.5rem;" aria-label="Retake quiz">🔄 Retake Quiz</button>
      </div>
    `;

    if (analyticsInstance) logEvent(analyticsInstance, 'quiz_complete', { score: pct });
    document.getElementById('retake-btn')?.addEventListener('click', retakeQuiz);
  } catch (e) {
    container.innerHTML = `
      <div class="quiz-result">
        <div class="result-label">Quiz complete!</div>
        <button class="btn btn-primary" id="retake-btn" style="margin-top:1rem;">🔄 Retake Quiz</button>
      </div>
    `;
    document.getElementById('retake-btn')?.addEventListener('click', retakeQuiz);
  }
}

function retakeQuiz() {
  currentQ = 0;
  selectedAnswers = new Array(questions.length).fill(-1);
  renderQuestion();
}

/* ── Dates ───────────────────────────────────────────────── */
let datesLoaded = false;

async function loadDates() {
  if (datesLoaded) return;
  datesLoaded = true;
  const list = document.getElementById('dates-list');
  try {
    const res = await fetch('/api/dates');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    list.innerHTML = data.dates.map(d => `
      <div class="date-card" role="listitem">
        <div class="date-dot ${escHtml(d.type)}" aria-hidden="true"></div>
        <div class="date-info">
          <div class="date-event">${escHtml(d.event)}</div>
          <div class="date-when">📅 ${escHtml(d.date)}</div>
        </div>
        <a class="cal-btn" href="${escHtml(d.calUrl)}" target="_blank" rel="noopener noreferrer"
           aria-label="Add ${escHtml(d.event)} to Google Calendar">
          📆 <span>Add</span>
        </a>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = '<div class="error-state">Failed to load dates.</div>'; }
}

/* ── Announcements ───────────────────────────────────────── */
let annLoaded = false;

async function loadAnnouncements() {
  if (annLoaded) return;
  annLoaded = true;
  const list = document.getElementById('ann-list');
  try {
    const res = await fetch('/api/announcements');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️' };
    list.innerHTML = data.announcements.map(a => `
      <div class="ann-item ${escHtml(a.type)}" role="listitem">
        <div class="ann-icon" aria-hidden="true">${icons[a.type] || 'ℹ️'}</div>
        <div>
          <div class="ann-text">${escHtml(a.text)}</div>
          <div class="ann-time">${escHtml(a.time)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = '<div class="error-state">Failed to load.</div>'; }
}

/* ── Chat ────────────────────────────────────────────────── */
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messagesEl = document.getElementById('chat-messages');
let chatHistory = [];
let isBotTyping = false;

function appendMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.setAttribute('role', 'article');
  div.setAttribute('aria-label', `${role === 'bot' ? 'AI' : 'Your'} message`);
  div.innerHTML = `
    <div class="msg-av" aria-hidden="true">${role === 'bot' ? 'AI' : 'ME'}</div>
    <div class="msg-bubble">${mdToHtml(escHtml(text))}</div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg bot'; div.id = 'typing';
  div.setAttribute('aria-label', 'AI is typing');
  div.innerHTML = `<div class="msg-av" aria-hidden="true">AI</div><div class="msg-bubble typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

async function sendMessage(text) {
  if (!text || isBotTyping) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  appendMsg('user', trimmed);
  chatInput.value = ''; chatInput.style.height = 'auto';
  isBotTyping = true; sendBtn.disabled = true;
  showTyping();

  if (analyticsInstance) logEvent(analyticsInstance, 'chat_message', { message_length: trimmed.length });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: trimmed, history: chatHistory }),
    });
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    removeTyping();

    if (data.error) {
      appendMsg('bot', '⚠️ ' + data.error);
    } else {
      appendMsg('bot', data.reply);
      chatHistory.push({ role: 'user', text: trimmed });
      chatHistory.push({ role: 'model', text: data.reply });
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
    }
  } catch (e) {
    removeTyping();
    appendMsg('bot', '⚠️ Network error. Please try again.');
  } finally {
    isBotTyping = false; sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', () => sendMessage(chatInput.value));

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput.value); }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('[data-panel="chat"]').click();
    setTimeout(() => sendMessage(btn.dataset.q), 100);
  });
});

/* ── Translate ───────────────────────────────────────────── */
async function doTranslate() {
  const text = document.getElementById('translate-input').value.trim();
  const language = document.getElementById('translate-lang').value;
  const resultEl = document.getElementById('translate-result');
  const btn = document.getElementById('translate-btn');

  if (!text) { resultEl.textContent = 'Please enter text to translate.'; return; }

  btn.disabled = true; btn.textContent = '⏳ Translating…';
  resultEl.textContent = 'Translating with Google Cloud Translation API…';

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);

    if (data.error) {
      resultEl.textContent = '⚠️ ' + data.error;
    } else {
      resultEl.innerHTML = escHtml(data.translated) +
        '<br><br><em style="color:var(--text-3);font-size:0.75rem;">Service: ' + escHtml(data.service || 'translation-api') + '</em>';
    }

    if (analyticsInstance) logEvent(analyticsInstance, 'translation', { language, service: data.service });
  } catch (e) {
    resultEl.textContent = '⚠️ Translation failed. Please try again.';
  } finally {
    btn.disabled = false; btn.textContent = '🌐 Translate with Cloud API';
  }
}


/* ── Parliament ──────────────────────────────────────────── */
let parliamentLoaded = false;

async function loadParliament() {
  if (parliamentLoaded) return;
  parliamentLoaded = true;
  const el = document.getElementById('parliament-content');
  try {
    const res = await fetch('/api/parliament');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    const ls = data.lokSabha;
    const rs = data.rajyaSabha;

    el.innerHTML = `
      <div class="parl-grid">
        <div class="parl-card">
          <h3>🏛️ Lok Sabha — ${ls.totalSeats} Seats</h3>
          <div class="parl-stat"><span class="label">Full Name</span><span class="value">${escHtml(ls.fullName)}</span></div>
          <div class="parl-stat"><span class="label">Term</span><span class="value">${escHtml(ls.term)}</span></div>
          <div class="parl-stat"><span class="label">Current</span><span class="value">${escHtml(ls.currentTerm)}</span></div>
          <div class="parl-stat"><span class="label">Elected By</span><span class="value">${escHtml(ls.electedBy)}</span></div>
          <div class="parl-stat"><span class="label">Eligibility</span><span class="value">${escHtml(ls.eligibility)}</span></div>
          <div class="parl-stat"><span class="label">Speaker</span><span class="value">${escHtml(ls.speaker)}</span></div>
          <div class="parl-stat"><span class="label">Reserved Seats</span><span class="value">${escHtml(ls.specialSeats)}</span></div>
          <div style="margin-top:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:0.5rem;font-family:var(--font-m);">KEY FUNCTIONS</div>
            <ul class="pres-list">${ls.keyFunctions.map(f => '<li>' + escHtml(f) + '</li>').join('')}</ul>
          </div>
        </div>
        <div class="parl-card">
          <h3>🏛️ Rajya Sabha — ${rs.totalSeats} Seats</h3>
          <div class="parl-stat"><span class="label">Full Name</span><span class="value">${escHtml(rs.fullName)}</span></div>
          <div class="parl-stat"><span class="label">Term</span><span class="value">${escHtml(rs.term)}</span></div>
          <div class="parl-stat"><span class="label">Elected Seats</span><span class="value">${escHtml(String(rs.electedSeats))}</span></div>
          <div class="parl-stat"><span class="label">Nominated</span><span class="value">${escHtml(String(rs.nominatedSeats))} (expertise in art/science/literature)</span></div>
          <div class="parl-stat"><span class="label">Elected By</span><span class="value">${escHtml(rs.electedBy)}</span></div>
          <div class="parl-stat"><span class="label">Eligibility</span><span class="value">${escHtml(rs.eligibility)}</span></div>
          <div class="parl-stat"><span class="label">Chairman</span><span class="value">${escHtml(rs.chairman)}</span></div>
          <div class="parl-stat"><span class="label">Permanent?</span><span class="value">Yes — never dissolved</span></div>
          <div style="margin-top:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:0.5rem;font-family:var(--font-m);">TOP STATE ALLOCATIONS</div>
            ${rs.stateSeats.slice(0, 6).map(s => `<div class="parl-stat"><span class="label">${escHtml(s.state)}</span><span class="value">${escHtml(String(s.seats))} seats</span></div>`).join('')}
          </div>
        </div>
      </div>
    `;
  } catch (e) { el.innerHTML = '<div class="error-state">Failed to load parliament data.</div>'; }
}

/* ── States ──────────────────────────────────────────────── */
let statesLoaded = false;
let allStates = [];

async function loadStates() {
  if (statesLoaded) return;
  statesLoaded = true;
  const el = document.getElementById('states-content');
  try {
    const res = await fetch('/api/states');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    allStates = data.states;
    renderStates(allStates);
  } catch (e) { el.innerHTML = '<div class="error-state">Failed to load states data.</div>'; }
}

function renderStates(states) {
  const el = document.getElementById('states-content');
  el.innerHTML = `
    <table class="states-table" role="table" aria-label="States and UTs electoral data">
      <thead>
        <tr>
          <th>Name</th><th>Capital</th><th>Type</th>
          <th>Vidhan Sabha</th><th>Lok Sabha</th><th>Rajya Sabha</th><th>Region</th>
        </tr>
      </thead>
      <tbody>
        ${states.map(s => `
          <tr>
            <td>${escHtml(s.name)}</td>
            <td style="color:var(--text-2)">${escHtml(s.capital)}</td>
            <td><span class="state-badge ${s.type === 'state' ? 'badge-state' : 'badge-ut'}">${escHtml(s.type.toUpperCase())}</span></td>
            <td style="font-family:var(--font-m);font-size:0.78rem;color:var(--saffron)">${escHtml(String(s.vidhanSabhaSeats))}</td>
            <td style="font-family:var(--font-m);font-size:0.78rem;color:var(--green)">${escHtml(String(s.lokSabhaSeats))}</td>
            <td style="font-family:var(--font-m);font-size:0.78rem;color:var(--gold)">${escHtml(String(s.rajyaSabhaSeats))}</td>
            <td style="color:var(--text-3);font-size:0.75rem">${escHtml(s.region)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="margin-top:0.75rem;font-family:var(--font-m);font-size:0.72rem;color:var(--text-3);">
      Showing ${states.length} of 36 states/UTs
    </div>
  `;
}

function filterStates(btn) {
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const f = btn.dataset.filter;
  if (f === 'all') { renderStates(allStates); return; }
  if (f === 'state') { renderStates(allStates.filter(s => s.type === 'state')); return; }
  if (f === 'ut') { renderStates(allStates.filter(s => s.type === 'ut')); return; }
  renderStates(allStates.filter(s => s.region === f));
}

/* ── President ───────────────────────────────────────────── */
let presidentLoaded = false;

async function loadPresident() {
  if (presidentLoaded) return;
  presidentLoaded = true;
  const el = document.getElementById('president-content');
  try {
    const res = await fetch('/api/president');
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const p = JSON.parse(_txt);

    el.innerHTML = `
      <div class="pres-grid">
        <div class="pres-card">
          <h3>🇮🇳 ${escHtml(p.title)}</h3>
          <div class="parl-stat"><span class="label">Current</span><span class="value">${escHtml(p.currentPresident)}</span></div>
          <div class="parl-stat"><span class="label">Term</span><span class="value">${escHtml(p.term)}</span></div>
          <div class="parl-stat"><span class="label">Elected By</span><span class="value">${escHtml(p.electedBy)}</span></div>
          <div class="parl-stat"><span class="label">Voting System</span><span class="value">${escHtml(p.votingSystem)}</span></div>
          <div style="margin-top:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:0.5rem;font-family:var(--font-m);">ELIGIBILITY</div>
            <ul class="pres-list">${p.eligibility.map(e => '<li>' + escHtml(e) + '</li>').join('')}</ul>
          </div>
        </div>
        <div class="pres-card">
          <h3>🏛️ Election Process</h3>
          ${p.process.map(s => `<div class="parl-stat"><span class="label">Step ${s.step}: ${escHtml(s.title)}</span><span class="value" style="text-align:right;max-width:200px">${escHtml(s.desc)}</span></div>`).join('')}
        </div>
      </div>
      <div class="pres-grid">
        <div class="pres-card">
          <h3>⚡ Presidential Powers</h3>
          <ul class="pres-list">${p.powers.map(pw => '<li>' + escHtml(pw) + '</li>').join('')}</ul>
        </div>
        <div class="pres-card">
          <h3>🎖️ Vice President</h3>
          <div class="parl-stat"><span class="label">Current</span><span class="value">${escHtml(p.vicePresident.current)}</span></div>
          <div class="parl-stat"><span class="label">Term</span><span class="value">${escHtml(p.vicePresident.term)}</span></div>
          <div class="parl-stat"><span class="label">Role</span><span class="value">${escHtml(p.vicePresident.role)}</span></div>
          <div class="parl-stat"><span class="label">Elected By</span><span class="value">${escHtml(p.vicePresident.electedBy)}</span></div>
        </div>
      </div>
    `;
  } catch (e) { el.innerHTML = '<div class="error-state">Failed to load president data.</div>'; }
}

/* ── i18n — bilingual UI (EN / HI) ──────────────────────── */
const I18N = {
  en: {
    nav: ['🏠 Home', '🗳️ How to Vote', '📋 Registration', '🎯 Quiz', '📍 ECI Map', '🤖 AI Assistant', '📅 Dates', '🏛️ Parliament', '🗺️ States & UTs', '🇮🇳 President', '🌐 Translate', '📢 Updates'],
    heroTag: "India's Democracy Guide",
    heroH1: 'Your Vote,<br><span>Your Voice</span>',
    heroSub: 'Understand Indian elections — from Lok Sabha to Panchayat — with AI-powered guidance. Know your rights, register to vote, and participate in democracy.',
    signIn: 'Sign in with Google',
    chatPlaceholder: 'Ask about elections… / चुनाव के बारे में पूछें…',
    secTitle_home: 'Types of Elections in India',
    secTitle_vote: 'How to Vote — Step by Step',
    secTitle_reg: 'How to Register as a Voter',
    secTitle_quiz: 'Test Your Election Knowledge',
    secTitle_map: 'Election Commission of India — HQ',
    secTitle_chat: '',
    secTitle_dates: 'Important Election Dates',
    secTitle_parl: 'Parliament of India',
    secTitle_states: 'States & Union Territories',
    secTitle_pres: 'President & Vice President of India',
    secTitle_translate: 'Translate Election Content',
    secTitle_updates: 'ECI Updates & Announcements',
  },
  hi: {
    nav: ['🏠 होम', '🗳️ मतदान कैसे करें', '📋 पंजीकरण', '🎯 क्विज़', '📍 ECI मानचित्र', '🤖 AI सहायक', '📅 तारीखें', '🏛️ संसद', '🗺️ राज्य और UTs', '🇮🇳 राष्ट्रपति', '🌐 अनुवाद', '📢 अपडेट'],
    heroTag: 'भारत का लोकतंत्र गाइड',
    heroH1: 'आपका वोट,<br><span>आपकी आवाज़</span>',
    heroSub: 'लोक सभा से पंचायत तक भारतीय चुनावों को AI-संचालित मार्गदर्शन के साथ समझें। अपने अधिकार जानें, मतदाता पंजीकरण करें और लोकतंत्र में भाग लें।',
    signIn: 'Google से साइन इन करें',
    chatPlaceholder: 'चुनाव के बारे में पूछें…',
    secTitle_home: 'भारत में चुनावों के प्रकार',
    secTitle_vote: 'मतदान कैसे करें — चरण दर चरण',
    secTitle_reg: 'मतदाता के रूप में पंजीकरण कैसे करें',
    secTitle_quiz: 'अपने चुनाव ज्ञान का परीक्षण करें',
    secTitle_map: 'भारत निर्वाचन आयोग — मुख्यालय',
    secTitle_chat: '',
    secTitle_dates: 'महत्वपूर्ण चुनाव तिथियाँ',
    secTitle_parl: 'भारत की संसद',
    secTitle_states: 'राज्य और केंद्र शासित प्रदेश',
    secTitle_pres: 'भारत के राष्ट्रपति एवं उपराष्ट्रपति',
    secTitle_translate: 'चुनाव सामग्री का अनुवाद',
    secTitle_updates: 'ECI अपडेट और घोषणाएँ',
  },
};

let currentLang = 'en';

function applyLang(lang) {
  currentLang = lang;
  const t = I18N[lang];
  document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach((btn, i) => {
    if (t.nav[i]) btn.textContent = t.nav[i];
  });

  // Hero
  const heroTag = document.querySelector('.hero-tag');
  if (heroTag) heroTag.textContent = t.heroTag;
  const heroH1 = document.querySelector('.hero h1');
  if (heroH1) heroH1.innerHTML = t.heroH1;
  const heroSub = document.querySelector('.hero-sub');
  if (heroSub) heroSub.textContent = t.heroSub;

  // Auth button
  const authBtn = document.getElementById('auth-btn');
  if (authBtn && !(auth && auth.currentUser)) authBtn.textContent = t.signIn;

  // Chat placeholder
  const chatIn = document.getElementById('chat-input');
  if (chatIn) chatIn.placeholder = t.chatPlaceholder;

  // Section titles (h2.section-title inside each panel)
  const titleMap = {
    'panel-home': t.secTitle_home,
    'panel-how-to-vote': t.secTitle_vote,
    'panel-register': t.secTitle_reg,
    'panel-quiz': t.secTitle_quiz,
    'panel-map': t.secTitle_map,
    'panel-dates': t.secTitle_dates,
    'panel-parliament': t.secTitle_parl,
    'panel-states': t.secTitle_states,
    'panel-president': t.secTitle_pres,
    'panel-translate': t.secTitle_translate,
    'panel-updates': t.secTitle_updates,
  };
  Object.entries(titleMap).forEach(([panelId, title]) => {
    if (!title) return;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const h2 = panel.querySelector('h2.section-title');
    if (h2) h2.textContent = title;
  });
}

document.getElementById('lang-select').addEventListener('change', e => applyLang(e.target.value));

document.getElementById('auth-btn').addEventListener('click', handleAuth);

document.getElementById('translate-btn').addEventListener('click', doTranslate);

document.querySelector('.filter-pills-group')?.addEventListener('click', e => {
  const btn = e.target.closest('.filter-pill');
  if (btn) filterStates(btn);
});

/* ── Natural Language Analysis (Google Cloud NL API) ────── */
/**
 * Sends election text to /api/analyze which calls
 * Google Cloud Natural Language API for entity + sentiment analysis.
 * This is a distinct AI/ML API separate from Gemini.
 */
async function doAnalyze() {
  const text = document.getElementById('analyze-input')?.value?.trim();
  const resultEl = document.getElementById('analyze-result');
  if (!resultEl) return;
  if (!text) { resultEl.textContent = 'Enter some election text to analyse.'; return; }

  resultEl.textContent = 'Analysing with Google Natural Language API…';
  try {
    const res  = await fetch('/api/analyze?text=' + encodeURIComponent(text.slice(0, 500)));
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);
    if (data.error) { resultEl.textContent = '⚠ ' + data.error; return; }

    const entityLines = data.entities && data.entities.length
      ? data.entities.map(e => escHtml(e.name) + ' (' + escHtml(e.type) + ')').join('\n')
      : 'No named entities found';

    resultEl.innerHTML =
      '<strong style="color:var(--saffron)">Entities:</strong>\n' + entityLines +
      '\n\n<strong style="color:var(--saffron)">Sentiment:</strong> ' +
      escHtml(data.sentiment.label) + ' (' + data.sentiment.score.toFixed(2) + ')' +
      (data.demo ? '\n<em style="color:var(--text-3)">[demo mode]</em>' : '');

    if (analyticsInstance) logEvent(analyticsInstance, 'nl_analysis', { text_length: text.length });
  } catch (e) {
    resultEl.textContent = '⚠ Analysis failed. Please try again.';
  }
}

/* ── Text-to-Speech (Google Cloud TTS API) ────────────────── */
/**
 * Converts text to speech using Google Cloud Text-to-Speech API.
 * Supports multiple Indian languages for accessibility.
 */
async function doTextToSpeech() {
  const text = document.getElementById('tts-input')?.value?.trim();
  const language = document.getElementById('tts-lang')?.value || 'en';
  const audioEl = document.getElementById('tts-audio');
  const statusEl = document.getElementById('tts-status');
  const btn = document.getElementById('tts-btn');

  if (!text) { statusEl.textContent = 'Please enter text to convert to speech.'; return; }

  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  statusEl.textContent = 'Generating speech with Cloud Text-to-Speech API…';
  audioEl.style.display = 'none';

  try {
    const res = await fetch('/api/text-to-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);

    if (data.error) {
      statusEl.textContent = '⚠ ' + data.error;
    } else if (data.audioContent) {
      audioEl.src = 'data:audio/mp3;base64,' + data.audioContent;
      audioEl.style.display = 'block';
      statusEl.innerHTML = '✅ Speech generated using <strong style="color:var(--saffron)">' + escHtml(data.service) + '</strong>';
      audioEl.play();
    } else if (data.demo) {
      statusEl.innerHTML = '⚠ ' + escHtml(data.message) + ' <em style="color:var(--text-3)">[demo mode]</em>';
    } else {
      statusEl.textContent = '⚠ Could not generate speech.';
    }

    if (analyticsInstance) logEvent(analyticsInstance, 'tts_request', { language, text_length: text.length });
  } catch (e) {
    statusEl.textContent = '⚠ Speech generation failed. Please try again.';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔊 Generate Speech';
  }
}

/* ── Voter ID Verification (Google Cloud Vision API) ──────── */
/**
 * Extracts text from Voter ID card images using Google Cloud Vision API OCR.
 * Validates presence of EPIC number pattern.
 */
async function verifyVoterID() {
  const fileInput = document.getElementById('voter-id-upload');
  const resultEl = document.getElementById('vision-result');

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    resultEl.textContent = 'Please select a Voter ID image first.';
    return;
  }

  const file = fileInput.files[0];

  if (file.size > 5 * 1024 * 1024) {
    resultEl.textContent = '⚠ Image too large. Max 5MB.';
    return;
  }

  resultEl.textContent = '🔍 Extracting text with Cloud Vision API…';

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/vision/verify-voter-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });
    const _txt = await res.text();
    if (!_txt.startsWith('{') && !_txt.startsWith('[')) {
      console.error('Not JSON:', _txt.substring(0, 50));
      return;
    }
    const data = JSON.parse(_txt);

    if (data.error) {
      resultEl.textContent = '⚠ ' + data.error;
    } else if (data.extracted) {
      const e = data.extracted;
      let output = '<strong style="color:var(--saffron)">Extracted Data:</strong>\n';

      if (e.epicNumber) {
        output += '✅ EPIC Number: <strong style="color:var(--green)">' + escHtml(e.epicNumber) + '</strong>\n';
      } else {
        output += '⚠ EPIC Number: Not detected\n';
      }

      if (e.name) output += 'Name: ' + escHtml(e.name) + '\n';
      if (e.lineCount) output += 'Lines detected: ' + e.lineCount + '\n';

      output += '\n<strong style="color:var(--saffron)">Confidence:</strong> ' + Math.round(data.confidence * 100) + '%';
      output += '\n<strong style="color:var(--saffron)">Valid Voter ID:</strong> ' + (data.isValidVoterID ? '✅ Yes' : '⚠ Unclear');
      output += '\n<em style="color:var(--text-3)">Service: ' + escHtml(data.service) + '</em>';

      if (data.demo) {
        output += '\n<em style="color:var(--text-3)">[demo mode]</em>';
      }

      resultEl.innerHTML = output;
    }

    if (analyticsInstance) logEvent(analyticsInstance, 'voter_id_scan', { result: data.isValidVoterID ? 'valid' : 'invalid' });
  } catch (e) {
    resultEl.textContent = '⚠ Image processing failed. Please try again.';
  }
}

/* ── Final Initialization ────────────────────────────────── */
window.addEventListener('load', () => {
  initFirebase();
  loadHomeData();
  loadSteps();
});
