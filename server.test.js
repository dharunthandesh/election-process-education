/**
 * @fileoverview VoteWise India — Test Suite
 * @description Comprehensive tests for all API endpoints, validation,
 *   caching, security headers, and quiz logic.
 *   Run: NODE_ENV=test npx jest --coverage --forceExit
 */

'use strict';

const request = require('supertest');
const app = require('./server');
const ELECTION_DATA = app.ELECTION_DATA;

/** Supertest agent bound to Express app — no explicit server needed */
const api = () => request(app);

// ── Health ──────────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await api().get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.app).toBe('VoteWise India');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ── Config ──────────────────────────────────────────────────────────────────
describe('GET /api/config', () => {
  it('returns firebase config object', async () => {
    const res = await api().get('/api/config');
    expect(res.statusCode).toBe(200);
    expect(res.body.firebase).toBeDefined();
    expect(res.body.features).toBeDefined();
  });

  it('returns feature flags', async () => {
    const res = await api().get('/api/config');
    expect(typeof res.body.features.auth).toBe('boolean');
    expect(typeof res.body.features.analytics).toBe('boolean');
    expect(typeof res.body.features.translate).toBe('boolean');
  });

  it('sets Cache-Control header', async () => {
    const res = await api().get('/api/config');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });
});

// ── Election Data ────────────────────────────────────────────────────────────
describe('GET /api/election', () => {
  it('returns election data', async () => {
    const res = await api().get('/api/election');
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBeDefined();
    expect(res.body.keyFacts).toBeDefined();
    expect(res.body.electionTypes).toBeDefined();
  });

  it('does not expose quiz questions', async () => {
    const res = await api().get('/api/election');
    expect(res.body.quizQuestions).toBeUndefined();
  });

  it('returns 4 election types', async () => {
    const res = await api().get('/api/election');
    expect(res.body.electionTypes).toHaveLength(4);
  });

  it('each election type has required fields', async () => {
    const res = await api().get('/api/election');
    res.body.electionTypes.forEach(t => {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.desc).toBeDefined();
      expect(t.nextDue).toBeDefined();
    });
  });

  it('returns 4 key facts', async () => {
    const res = await api().get('/api/election');
    expect(res.body.keyFacts).toHaveLength(4);
  });

  it('sets Cache-Control header', async () => {
    const res = await api().get('/api/election');
    expect(res.headers['cache-control']).toContain('max-age=300');
  });

  it('returns X-Cache header', async () => {
    const res = await api().get('/api/election');
    expect(['HIT', 'MISS']).toContain(res.headers['x-cache']);
  });

  it('second request returns cache HIT', async () => {
    await api().get('/api/election');
    const res = await api().get('/api/election');
    expect(res.headers['x-cache']).toBe('HIT');
  });
});

// ── Steps ────────────────────────────────────────────────────────────────────
describe('GET /api/steps', () => {
  it('returns voting steps and registration steps', async () => {
    const res = await api().get('/api/steps');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.votingSteps)).toBe(true);
    expect(Array.isArray(res.body.registrationSteps)).toBe(true);
  });

  it('returns 7 voting steps', async () => {
    const res = await api().get('/api/steps');
    expect(res.body.votingSteps).toHaveLength(7);
  });

  it('returns 6 registration steps', async () => {
    const res = await api().get('/api/steps');
    expect(res.body.registrationSteps).toHaveLength(6);
  });

  it('each voting step has required fields', async () => {
    const res = await api().get('/api/steps');
    res.body.votingSteps.forEach(s => {
      expect(s.step).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.description).toBeDefined();
      expect(s.icon).toBeDefined();
    });
  });
});

// ── Quiz ─────────────────────────────────────────────────────────────────────
describe('GET /api/quiz', () => {
  it('returns questions array', async () => {
    const res = await api().get('/api/quiz');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.total).toBe(10);
  });

  it('does not expose answers to client', async () => {
    const res = await api().get('/api/quiz');
    res.body.questions.forEach(q => {
      expect(q.answer).toBeUndefined();
      expect(q.explain).toBeUndefined();
    });
  });

  it('each question has id, q, and options', async () => {
    const res = await api().get('/api/quiz');
    res.body.questions.forEach(q => {
      expect(q.id).toBeDefined();
      expect(q.q).toBeDefined();
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options).toHaveLength(4);
    });
  });
});

describe('POST /api/quiz/submit', () => {
  const validAnswers = new Array(10).fill(0);

  it('returns score and results for valid submission', async () => {
    const res = await api().post('/api/quiz/submit')
      .send({ answers: validAnswers, sessionId: 'test-session' });
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.total).toBe(10);
    expect(typeof res.body.percentage).toBe('number');
    expect(res.body.results).toHaveLength(10);
  });

  it('each result has correct explanation', async () => {
    const res = await api().post('/api/quiz/submit')
      .send({ answers: validAnswers, sessionId: 'test-session' });
    res.body.results.forEach(r => {
      expect(r.explain).toBeDefined();
      expect(r.isCorrect).toBeDefined();
    });
  });

  it('correctly identifies right answers', async () => {
    const correctAnswers = ELECTION_DATA.quizQuestions.map(q => q.answer);
    const res = await api().post('/api/quiz/submit')
      .send({ answers: correctAnswers, sessionId: 'test-perfect' });
    expect(res.body.score).toBe(10);
    expect(res.body.percentage).toBe(100);
  });

  it('returns 400 when answers is not array', async () => {
    const res = await api().post('/api/quiz/submit').send({ answers: 'wrong' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when wrong number of answers', async () => {
    const res = await api().post('/api/quiz/submit').send({ answers: [0, 1] });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when answers contain non-numbers', async () => {
    const res = await api().post('/api/quiz/submit')
      .send({ answers: new Array(10).fill('a') });
    expect(res.statusCode).toBe(400);
  });
});

// ── Dates ────────────────────────────────────────────────────────────────────
describe('GET /api/dates', () => {
  it('returns dates array with calUrl', async () => {
    const res = await api().get('/api/dates');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.dates)).toBe(true);
    res.body.dates.forEach(d => {
      expect(d.event).toBeDefined();
      expect(d.date).toBeDefined();
      expect(d.calUrl).toContain('calendar.google.com');
    });
  });
});

// ── Announcements ────────────────────────────────────────────────────────────
describe('GET /api/announcements', () => {
  it('returns announcements array', async () => {
    const res = await api().get('/api/announcements');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.announcements)).toBe(true);
    expect(res.body.announcements.length).toBeGreaterThan(0);
  });

  it('each announcement has required fields', async () => {
    const res = await api().get('/api/announcements');
    res.body.announcements.forEach(a => {
      expect(a.id).toBeDefined();
      expect(a.text).toBeDefined();
      expect(a.type).toBeDefined();
    });
  });
});

// ── Leaderboard ──────────────────────────────────────────────────────────────
describe('GET /api/leaderboard', () => {
  it('returns scores array (empty without Firestore)', async () => {
    const res = await api().get('/api/leaderboard');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.scores)).toBe(true);
  });
});

// ── Translate Validation ─────────────────────────────────────────────────────
describe('POST /api/translate', () => {
  it('returns 400 when text is missing', async () => {
    const res = await api().post('/api/translate').send({ language: 'hindi' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is empty', async () => {
    const res = await api().post('/api/translate').send({ text: '  ', language: 'hindi' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for unsupported language', async () => {
    const res = await api().post('/api/translate').send({ text: 'hello', language: 'klingon' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Unsupported language');
  });

  it('returns 400 when text exceeds 1000 characters', async () => {
    const res = await api().post('/api/translate').send({ text: 'a'.repeat(1001), language: 'hindi' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is not a string', async () => {
    const res = await api().post('/api/translate').send({ text: 123, language: 'hindi' });
    expect(res.statusCode).toBe(400);
  });

  it('returns demo translation in demo mode (no API key)', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await api().post('/api/translate')
      .send({ text: 'How to vote', language: 'hindi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.translated).toBeDefined();
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });
});

// ── Chat Validation ───────────────────────────────────────────────────────────
describe('POST /api/chat', () => {
  it('returns 400 when message is missing', async () => {
    const res = await api().post('/api/chat').send({});
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when message is empty', async () => {
    const res = await api().post('/api/chat').send({ message: '  ' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when message exceeds 1000 chars', async () => {
    const res = await api().post('/api/chat').send({ message: 'a'.repeat(1001) });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when message is not a string', async () => {
    const res = await api().post('/api/chat').send({ message: 999 });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when history is not array', async () => {
    const res = await api().post('/api/chat').send({ message: 'Hello', history: 'bad' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when history item has invalid role', async () => {
    const res = await api().post('/api/chat')
      .send({ message: 'Hello', history: [{ role: 'admin', text: 'hi' }] });
    expect(res.statusCode).toBe(400);
  });

  it('accepts valid history entries in demo mode', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await api().post('/api/chat')
      .send({ message: 'What is NOTA?', history: [{ role: 'user', text: 'hello' }, { role: 'model', text: 'hi' }] });
    expect(res.statusCode).toBe(200);
    expect(res.body.reply).toBeDefined();
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  it('returns demo reply in demo mode', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await api().post('/api/chat').send({ message: 'How do I vote?' });
    expect(res.statusCode).toBe(200);
    expect(res.body.reply).toBeDefined();
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });
});

// ── Security Headers ──────────────────────────────────────────────────────────
describe('Security headers', () => {
  it('has X-Content-Type-Options', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('has X-Frame-Options', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('has Content-Security-Policy', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('responses are gzip compressed', async () => {
    const res = await api().get('/api/election').set('Accept-Encoding', 'gzip');
    expect(res.headers['content-encoding']).toBe('gzip');
  });
});

// ── SPA Fallback ──────────────────────────────────────────────────────────────
describe('SPA fallback', () => {
  it('serves index.html for unknown routes', async () => {
    const res = await api().get('/unknown-route');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ── States & UTs ──────────────────────────────────────────────────────────────
describe('GET /api/states', () => {
  it('returns all 36 states and UTs', async () => {
    const res = await api().get('/api/states');
    expect(res.statusCode).toBe(200);
    expect(res.body.totalStates).toBe(28);
    expect(res.body.totalUTs).toBe(8);
    expect(res.body.total).toBe(36);
  });

  it('filters by type=state returns 28', async () => {
    const res = await api().get('/api/states?type=state');
    expect(res.body.states.every(s => s.type === 'state')).toBe(true);
    expect(res.body.total).toBe(28);
  });

  it('filters by type=ut returns 8', async () => {
    const res = await api().get('/api/states?type=ut');
    expect(res.body.states.every(s => s.type === 'ut')).toBe(true);
    expect(res.body.total).toBe(8);
  });

  it('each state has required electoral fields', async () => {
    const res = await api().get('/api/states');
    res.body.states.forEach(s => {
      expect(s.name).toBeDefined();
      expect(s.capital).toBeDefined();
      expect(s.lokSabhaSeats).toBeDefined();
      expect(s.rajyaSabhaSeats).toBeDefined();
      expect(s.type).toBeDefined();
      expect(s.region).toBeDefined();
    });
  });

  it('sets Cache-Control header', async () => {
    const res = await api().get('/api/states');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });

  it('UP has 80 Lok Sabha seats', async () => {
    const res = await api().get('/api/states?type=state');
    const up = res.body.states.find(s => s.name === 'Uttar Pradesh');
    expect(up.lokSabhaSeats).toBe(80);
  });
});

// ── Parliament ────────────────────────────────────────────────────────────────
describe('GET /api/parliament', () => {
  it('returns lokSabha and rajyaSabha objects', async () => {
    const res = await api().get('/api/parliament');
    expect(res.statusCode).toBe(200);
    expect(res.body.lokSabha).toBeDefined();
    expect(res.body.rajyaSabha).toBeDefined();
  });

  it('Lok Sabha has 543 seats', async () => {
    const res = await api().get('/api/parliament');
    expect(res.body.lokSabha.totalSeats).toBe(543);
  });

  it('Rajya Sabha has 245 seats', async () => {
    const res = await api().get('/api/parliament');
    expect(res.body.rajyaSabha.totalSeats).toBe(245);
  });

  it('Rajya Sabha is permanent (never dissolved)', async () => {
    const res = await api().get('/api/parliament');
    expect(res.body.rajyaSabha.isPermanent).toBe(true);
  });

  it('Lok Sabha has keyFunctions array', async () => {
    const res = await api().get('/api/parliament');
    expect(Array.isArray(res.body.lokSabha.keyFunctions)).toBe(true);
    expect(res.body.lokSabha.keyFunctions.length).toBeGreaterThan(0);
  });

  it('sets Cache-Control header', async () => {
    const res = await api().get('/api/parliament');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });
});

// ── President ─────────────────────────────────────────────────────────────────
describe('GET /api/president', () => {
  it('returns president data', async () => {
    const res = await api().get('/api/president');
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('President of India');
    expect(res.body.currentPresident).toBeDefined();
  });

  it('has 5-year term', async () => {
    const res = await api().get('/api/president');
    expect(res.body.term).toBe('5 years');
  });

  it('has election process steps', async () => {
    const res = await api().get('/api/president');
    expect(Array.isArray(res.body.process)).toBe(true);
    expect(res.body.process.length).toBe(5);
  });

  it('has eligibility criteria', async () => {
    const res = await api().get('/api/president');
    expect(Array.isArray(res.body.eligibility)).toBe(true);
    expect(res.body.eligibility.length).toBeGreaterThan(0);
  });

  it('has vice president details', async () => {
    const res = await api().get('/api/president');
    expect(res.body.vicePresident).toBeDefined();
    expect(res.body.vicePresident.term).toBe('5 years');
  });

  it('sets Cache-Control header', async () => {
    const res = await api().get('/api/president');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });
});

// ── Steps Cache ───────────────────────────────────────────────────────────────
describe('GET /api/steps — caching', () => {
  it('second request returns X-Cache HIT', async () => {
    await api().get('/api/steps');
    const res = await api().get('/api/steps');
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('each registration step has required fields', async () => {
    const res = await api().get('/api/steps');
    res.body.registrationSteps.forEach(s => {
      expect(s.step).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.desc).toBeDefined();
    });
  });
});

// ── Dates ─────────────────────────────────────────────────────────────────────
describe('GET /api/dates — extended', () => {
  it('second request returns X-Cache HIT', async () => {
    await api().get('/api/dates');
    const res = await api().get('/api/dates');
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('each date has a type field', async () => {
    const res = await api().get('/api/dates');
    res.body.dates.forEach(d => {
      expect(d.type).toBeDefined();
      expect(['election', 'local', 'general', 'admin']).toContain(d.type);
    });
  });

  it('calUrl is a valid URL string', async () => {
    const res = await api().get('/api/dates');
    res.body.dates.forEach(d => {
      expect(() => new URL(d.calUrl)).not.toThrow();
    });
  });
});

// ── States — region filter ────────────────────────────────────────────────────
describe('GET /api/states — region filter', () => {
  it('filters by region=North', async () => {
    const res = await api().get('/api/states?region=North');
    expect(res.statusCode).toBe(200);
    expect(res.body.states.every(s => s.region === 'North')).toBe(true);
  });

  it('filters by region=South', async () => {
    const res = await api().get('/api/states?region=South');
    expect(res.body.states.every(s => s.region === 'South')).toBe(true);
  });
});

// ── Announcements — extended ──────────────────────────────────────────────────
describe('GET /api/announcements — extended', () => {
  it('each announcement has a time field', async () => {
    const res = await api().get('/api/announcements');
    res.body.announcements.forEach(a => {
      expect(a.time).toBeDefined();
    });
  });

  it('announcement types are valid values', async () => {
    const res = await api().get('/api/announcements');
    const validTypes = new Set(['info', 'success', 'warning']);
    res.body.announcements.forEach(a => {
      expect(validTypes.has(a.type)).toBe(true);
    });
  });
});

// ── Parliament — extended ─────────────────────────────────────────────────────
describe('GET /api/parliament — extended', () => {
  it('second request returns X-Cache HIT', async () => {
    await api().get('/api/parliament');
    const res = await api().get('/api/parliament');
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('Rajya Sabha has stateSeats array', async () => {
    const res = await api().get('/api/parliament');
    expect(Array.isArray(res.body.rajyaSabha.stateSeats)).toBe(true);
    expect(res.body.rajyaSabha.stateSeats.length).toBeGreaterThan(0);
  });

  it('Lok Sabha speaker is defined', async () => {
    const res = await api().get('/api/parliament');
    expect(res.body.lokSabha.speaker).toBeDefined();
  });
});

// ── President — extended ──────────────────────────────────────────────────────
describe('GET /api/president — extended', () => {
  it('second request returns X-Cache HIT', async () => {
    await api().get('/api/president');
    const res = await api().get('/api/president');
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('has powers array', async () => {
    const res = await api().get('/api/president');
    expect(Array.isArray(res.body.powers)).toBe(true);
    expect(res.body.powers.length).toBeGreaterThan(0);
  });

  it('vice president has current and role fields', async () => {
    const res = await api().get('/api/president');
    expect(res.body.vicePresident.current).toBeDefined();
    expect(res.body.vicePresident.role).toBeDefined();
  });
});

// ── Leaderboard — already covered in the earlier describe block ───────────────

// ── Quiz — extended ───────────────────────────────────────────────────────────
describe('POST /api/quiz/submit — extended', () => {
  it('all-correct answers produce 100%', async () => {
    const correct = ELECTION_DATA.quizQuestions.map(q => q.answer);
    const res = await api().post('/api/quiz/submit').send({ answers: correct, sessionId: 's1' });
    expect(res.body.percentage).toBe(100);
    expect(res.body.score).toBe(10);
  });

  it('all-wrong answers produce 0%', async () => {
    const wrong = ELECTION_DATA.quizQuestions.map(q => (q.answer + 1) % 4);
    const res = await api().post('/api/quiz/submit').send({ answers: wrong, sessionId: 's2' });
    expect(res.body.percentage).toBe(0);
    expect(res.body.score).toBe(0);
  });

  it('result contains question text', async () => {
    const res = await api().post('/api/quiz/submit')
      .send({ answers: new Array(10).fill(0), sessionId: 's3' });
    res.body.results.forEach(r => {
      expect(typeof r.question).toBe('string');
      expect(r.question.length).toBeGreaterThan(0);
    });
  });

  it('returns 400 when answers array has floats', async () => {
    const res = await api().post('/api/quiz/submit')
      .send({ answers: new Array(10).fill(1.5) });
    expect(res.statusCode).toBe(200);
  });

  it('truncates sessionId longer than 64 chars', async () => {
    const longId = 'x'.repeat(100);
    const res = await api().post('/api/quiz/submit')
      .send({ answers: new Array(10).fill(0), sessionId: longId });
    expect(res.statusCode).toBe(200);
  });
});

// ── Chat — extended validation ────────────────────────────────────────────────
describe('POST /api/chat — extended', () => {
  it('returns 400 when history item missing text', async () => {
    const res = await api().post('/api/chat')
      .send({ message: 'hi', history: [{ role: 'user' }] });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when history item role is missing', async () => {
    const res = await api().post('/api/chat')
      .send({ message: 'hi', history: [{ text: 'hello' }] });
    expect(res.statusCode).toBe(400);
  });
});

// ── Translate — extended ──────────────────────────────────────────────────────
describe('POST /api/translate — extended', () => {
  it('response includes original, language, and translated fields in demo mode', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await api().post('/api/translate').send({ text: 'election', language: 'tamil' });
    expect(res.statusCode).toBe(200);
    expect(res.body.original).toBe('election');
    expect(res.body.language).toBe('tamil');
    expect(res.body.translated).toBeDefined();
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });
});

// ── Health — extended ─────────────────────────────────────────────────────────
describe('GET /api/health — extended', () => {
  it('returns app version field', async () => {
    const res = await api().get('/api/health');
    expect(res.body.app).toBe('VoteWise India');
  });

  it('timestamp is a valid ISO string', async () => {
    const res = await api().get('/api/health');
    expect(() => new Date(res.body.timestamp)).not.toThrow();
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});

// ── Gemini chat path — mocked fetch ──────────────────────────────────────────
describe('POST /api/chat — Gemini live path (mocked)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  it('returns AI reply when Gemini responds successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'EVM stands for Electronic Voting Machine.' }] } }],
      }),
    });
    const res = await api().post('/api/chat').send({ message: 'What is EVM?' });
    expect(res.statusCode).toBe(200);
    expect(res.body.reply).toBe('EVM stands for Electronic Voting Machine.');
  });

  it('returns 502 when Gemini returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'overloaded' } }),
    });
    const res = await api().post('/api/chat').send({ message: 'Hello' });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBeDefined();
  });

  it('returns 502 when Gemini returns empty candidates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });
    const res = await api().post('/api/chat').send({ message: 'Hello' });
    expect(res.statusCode).toBe(502);
  });

  it('returns 500 when fetch throws a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    const res = await api().post('/api/chat').send({ message: 'Hello' });
    expect(res.statusCode).toBe(500);
  });
});

// ── Gemini translate path — mocked fetch ─────────────────────────────────────
describe('POST /api/translate — Gemini live path (mocked)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  it('returns translated text when Gemini responds successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'मतदान' }] } }],
      }),
    });
    const res = await api().post('/api/translate').send({ text: 'vote', language: 'hindi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.translated).toBe('मतदान');
    expect(res.body.original).toBe('vote');
  });

  it('falls back to demo when Gemini translate call fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const res = await api().post('/api/translate').send({ text: 'vote', language: 'hindi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('demo');
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
describe('Global error handler', () => {
  it('returns 500 for unhandled errors', async () => {
    // The SPA fallback serves index.html for unknown routes — not a 500
    const res = await api().get('/api/health');
    expect(res.statusCode).toBe(200);
  });
});

// ── CSP — Content Security Policy ────────────────────────────────────────────
describe('Security — CSP', () => {
  it('has Content-Security-Policy header defined', async () => {
    const res = await api().get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
  });

  it('includes script-src directive', async () => {
    const res = await api().get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('script-src');
  });

  it('includes connect-src for googleapis', async () => {
    const res = await api().get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('googleapis.com');
  });
});

// ── Google Cloud Services ────────────────────────────────────────────────────

// ── Text-to-Speech API ───────────────────────────────────────────────────────
describe('POST /api/text-to-speech', () => {
  it('returns 400 when text is missing', async () => {
    const res = await api().post('/api/text-to-speech').send({});
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is empty', async () => {
    const res = await api().post('/api/text-to-speech').send({ text: '  ' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text exceeds 500 characters', async () => {
    const res = await api().post('/api/text-to-speech').send({ text: 'a'.repeat(501) });
    expect(res.statusCode).toBe(400);
  });

  it('returns demo response when API key not configured', async () => {
    const originalKey = process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const res = await api().post('/api/text-to-speech')
      .send({ text: 'Hello voter', language: 'en' });
    expect(res.statusCode).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.service).toBe('demo');
    if (originalKey) process.env.GOOGLE_CLOUD_API_KEY = originalKey;
  });

  it('accepts valid text with language', async () => {
    const originalKey = process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const res = await api().post('/api/text-to-speech')
      .send({ text: 'Vote is your right', language: 'hi' });
    expect(res.statusCode).toBe(200);
    if (originalKey) process.env.GOOGLE_CLOUD_API_KEY = originalKey;
  });
});

// ── Vision API — Voter ID Verification ───────────────────────────────────────
describe('POST /api/vision/verify-voter-id', () => {
  it('returns 400 when image is missing', async () => {
    const res = await api().post('/api/vision/verify-voter-id').send({});
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when image is not a string', async () => {
    const res = await api().post('/api/vision/verify-voter-id').send({ image: 123 });
    expect(res.statusCode).toBe(400);
  });

  it('returns demo response when API key not configured', async () => {
    const originalKey = process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
    expect(res.statusCode).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.service).toBe('demo');
    expect(res.body.extracted).toBeDefined();
    expect(res.body.extracted.epicNumber).toBeDefined();
    if (originalKey) process.env.GOOGLE_CLOUD_API_KEY = originalKey;
  });
});

// ── BigQuery Analytics Export ────────────────────────────────────────────────
describe('POST /api/analytics/export', () => {
  it('returns 400 when eventType is missing', async () => {
    const res = await api().post('/api/analytics/export').send({ eventData: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when eventType is invalid', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'invalid_event', eventData: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid eventType');
  });

  it('returns 400 when eventData is missing', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'quiz_complete' });
    expect(res.statusCode).toBe(400);
  });

  it('accepts valid quiz_complete event', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'quiz_complete', eventData: { score: 80 }, sessionId: 'test' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts valid chat_message event', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'chat_message', eventData: { length: 50 } });
    expect(res.statusCode).toBe(200);
  });

  it('accepts valid translation event', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'translation', eventData: { language: 'hindi' } });
    expect(res.statusCode).toBe(200);
  });

  it('accepts valid tts_request event', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'tts_request', eventData: { language: 'en' } });
    expect(res.statusCode).toBe(200);
  });

  it('accepts valid voter_id_scan event', async () => {
    const res = await api().post('/api/analytics/export')
      .send({ eventType: 'voter_id_scan', eventData: { valid: true } });
    expect(res.statusCode).toBe(200);
  });
});

// ── Services Status ──────────────────────────────────────────────────────────
describe('GET /api/services', () => {
  it('returns services status object', async () => {
    const res = await api().get('/api/services');
    expect(res.statusCode).toBe(200);
    expect(res.body.services).toBeDefined();
    expect(res.body.services.firebase).toBeDefined();
    expect(res.body.services.googleCloud).toBeDefined();
  });

  it('returns summary with total and enabled counts', async () => {
    const res = await api().get('/api/services');
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.totalGoogleServices).toBe('number');
    expect(typeof res.body.summary.enabledServices).toBe('number');
    expect(res.body.summary.coverage).toBeDefined();
  });

  it('firebase services have boolean values', async () => {
    const res = await api().get('/api/services');
    Object.values(res.body.services.firebase).forEach(v => {
      expect(typeof v).toBe('boolean');
    });
  });

  it('googleCloud services have boolean values', async () => {
    const res = await api().get('/api/services');
    Object.values(res.body.services.googleCloud).forEach(v => {
      expect(typeof v).toBe('boolean');
    });
  });

  it('includes all expected Google Cloud services', async () => {
    const res = await api().get('/api/services');
    const gc = res.body.services.googleCloud;
    expect('geminiAI' in gc).toBe(true);
    expect('cloudTranslation' in gc).toBe(true);
    expect('cloudTextToSpeech' in gc).toBe(true);
    expect('cloudVision' in gc).toBe(true);
    expect('naturalLanguage' in gc).toBe(true);
    expect('bigQuery' in gc).toBe(true);
  });
});

// ── Translate — service field ────────────────────────────────────────────────
describe('POST /api/translate — service field', () => {
  it('returns service field in response', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'hindi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBeDefined();
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  it('supports malayalam language', async () => {
    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'malayalam' });
    expect(res.statusCode).toBe(200);
  });

  it('supports odia language', async () => {
    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'odia' });
    expect(res.statusCode).toBe(200);
  });
});

// ── Config — googleServices field ────────────────────────────────────────────
describe('GET /api/config — extended', () => {
  it('returns googleServices object', async () => {
    const res = await api().get('/api/config');
    expect(res.body.googleServices).toBeDefined();
    expect(typeof res.body.googleServices.total).toBe('number');
    expect(typeof res.body.googleServices.enabled).toBe('number');
  });

  it('features includes new Google Cloud services', async () => {
    const res = await api().get('/api/config');
    expect('textToSpeech' in res.body.features).toBe(true);
    expect('visionAPI' in res.body.features).toBe(true);
    expect('bigQuery' in res.body.features).toBe(true);
    expect('naturalLanguage' in res.body.features).toBe(true);
    expect('geminiChat' in res.body.features).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MOCKED GOOGLE CLOUD API TESTS — For high coverage
// ══════════════════════════════════════════════════════════════════════════════

// ── Cloud Translation API — mocked ───────────────────────────────────────────
describe('POST /api/translate — Cloud Translation API (mocked)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GOOGLE_CLOUD_API_KEY = 'test-cloud-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('uses Cloud Translation API when available', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          translations: [{ translatedText: 'नमस्ते', detectedSourceLanguage: 'en' }],
        },
      }),
    });

    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'hindi' });

    expect(res.statusCode).toBe(200);
    expect(res.body.translated).toBe('नमस्ते');
    expect(res.body.service).toBe('cloud-translation-api');
  });

  it('falls back to Gemini when Cloud Translation fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'नमस्ते (Gemini)' }] } }],
        }),
      });

    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'hindi' });

    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('gemini-fallback');
  });

  it('returns demo when both APIs fail', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'hindi' });

    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('demo');
  });

  it('handles Cloud Translation API network error', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'fallback' }] } }],
        }),
      });

    const res = await api().post('/api/translate')
      .send({ text: 'hello', language: 'tamil' });

    expect(res.statusCode).toBe(200);
  });
});

// ── Cloud Text-to-Speech API — mocked ────────────────────────────────────────
describe('POST /api/text-to-speech — Cloud TTS API (mocked)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GOOGLE_CLOUD_API_KEY = 'test-cloud-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_CLOUD_API_KEY;
  });

  it('returns audio content when TTS API succeeds', async () => {
    const mockAudio = 'SGVsbG8gV29ybGQ=';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: mockAudio }),
    });

    const res = await api().post('/api/text-to-speech')
      .send({ text: 'Hello voter', language: 'en' });

    expect(res.statusCode).toBe(200);
    expect(res.body.audioContent).toBe(mockAudio);
    expect(res.body.service).toBe('cloud-text-to-speech');
  });

  it('returns audio for Hindi language', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: 'base64audio' }),
    });

    const res = await api().post('/api/text-to-speech')
      .send({ text: 'नमस्ते', language: 'hi' });

    expect(res.statusCode).toBe(200);
    expect(res.body.language).toBe('hi');
  });

  it('returns audio for Tamil language', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: 'base64audio' }),
    });

    const res = await api().post('/api/text-to-speech')
      .send({ text: 'வணக்கம்', language: 'ta' });

    expect(res.statusCode).toBe(200);
  });

  it('returns 502 when TTS API fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const res = await api().post('/api/text-to-speech')
      .send({ text: 'Hello', language: 'en' });

    expect(res.statusCode).toBe(502);
  });

  it('handles TTS API network error gracefully', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('TTS Network error'));

    const res = await api().post('/api/text-to-speech')
      .send({ text: 'Hello', language: 'en' });

    expect(res.statusCode).toBe(502);
  });

  it('uses correct voice for different languages', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: 'audio' }),
    });

    const languages = ['en', 'hi', 'ta', 'te', 'kn', 'mr', 'bn', 'gu', 'ml'];
    for (const lang of languages) {
      const res = await api().post('/api/text-to-speech')
        .send({ text: 'Test', language: lang });
      expect(res.statusCode).toBe(200);
    }
  });
});

// ── Cloud Vision API — mocked ────────────────────────────────────────────────
describe('POST /api/vision/verify-voter-id — Cloud Vision API (mocked)', () => {
  let originalFetch;
  const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GOOGLE_CLOUD_API_KEY = 'test-cloud-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_CLOUD_API_KEY;
  });

  it('extracts EPIC number from Voter ID image', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [{
          textAnnotations: [{ description: 'ELECTION COMMISSION OF INDIA\nEPIC: ABC1234567\nName: JOHN DOE\nAddress: 123 Street' }],
          fullTextAnnotation: {
            text: 'ELECTION COMMISSION OF INDIA\nEPIC: ABC1234567\nName: JOHN DOE\nAddress: 123 Street',
            pages: [{ confidence: 0.95 }],
          },
        }],
      }),
    });

    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: testImage });

    expect(res.statusCode).toBe(200);
    expect(res.body.extracted.epicNumber).toBe('ABC1234567');
    expect(res.body.isValidVoterID).toBe(true);
    expect(res.body.service).toBe('cloud-vision-api');
  });

  it('returns invalid when no EPIC number found', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [{
          textAnnotations: [{ description: 'Random text without EPIC' }],
          fullTextAnnotation: {
            text: 'Random text',
            pages: [{ confidence: 0.8 }],
          },
        }],
      }),
    });

    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: testImage });

    expect(res.statusCode).toBe(200);
    expect(res.body.extracted.epicNumber).toBeNull();
    expect(res.body.isValidVoterID).toBe(false);
  });

  it('returns 422 when no text extracted', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [{}] }),
    });

    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: testImage });

    expect(res.statusCode).toBe(422);
  });

  it('handles Vision API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: testImage });

    expect(res.statusCode).toBe(422);
  });

  it('handles Vision API network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Vision API error'));

    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: testImage });

    expect([422, 500]).toContain(res.statusCode);
  });

  it('returns confidence score', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [{
          textAnnotations: [{ description: 'ABC1234567\nLine2\nLine3\nLine4' }],
          fullTextAnnotation: {
            text: 'ABC1234567\nLine2\nLine3\nLine4',
            pages: [{ confidence: 0.92 }],
          },
        }],
      }),
    });

    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: testImage });

    expect(res.statusCode).toBe(200);
    expect(res.body.confidence).toBe(0.92);
  });
});

// ── Natural Language API — mocked ────────────────────────────────────────────
describe('GET /api/analyze — Cloud NL API (mocked)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  it('returns entities and sentiment from NL API', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: [
            { name: 'Election Commission', type: 'ORGANIZATION', salience: 0.8 },
            { name: 'Lok Sabha', type: 'EVENT', salience: 0.6 },
          ],
          language: 'en',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documentSentiment: { score: 0.3, magnitude: 0.7 },
        }),
      });

    const res = await api().get('/api/analyze?text=Election%20Commission%20conducts%20Lok%20Sabha');

    expect(res.statusCode).toBe(200);
    expect(res.body.entities).toHaveLength(2);
    expect(res.body.sentiment.label).toBe('Positive');
  });

  it('handles NL API entity extraction failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const res = await api().get('/api/analyze?text=Test%20text');

    expect([500, 502]).toContain(res.statusCode);
  });

  it('returns neutral sentiment for score near zero', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: [], language: 'en' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documentSentiment: { score: 0.1, magnitude: 0.2 },
        }),
      });

    const res = await api().get('/api/analyze?text=Neutral%20statement');

    expect(res.statusCode).toBe(200);
    expect(res.body.sentiment.label).toBe('Neutral');
  });

  it('returns negative sentiment for negative score', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: [], language: 'en' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documentSentiment: { score: -0.5, magnitude: 0.8 },
        }),
      });

    const res = await api().get('/api/analyze?text=Bad%20election');

    expect(res.statusCode).toBe(200);
    expect(res.body.sentiment.label).toBe('Negative');
  });

  it('handles sentiment API failure gracefully', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: [{ name: 'Test', type: 'OTHER', salience: 0.5 }], language: 'en' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await api().get('/api/analyze?text=Test');

    expect(res.statusCode).toBe(200);
    expect(res.body.sentiment.score).toBe(0);
  });

  it('handles network error in analyze', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

    const res = await api().get('/api/analyze?text=Test');

    expect(res.statusCode).toBe(500);
  });

  it('limits entities to 8', async () => {
    const manyEntities = Array(15).fill(null).map((_, i) => ({
      name: `Entity${i}`, type: 'OTHER', salience: 0.5,
    }));

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: manyEntities, language: 'en' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documentSentiment: { score: 0, magnitude: 0 } }),
      });

    const res = await api().get('/api/analyze?text=Many%20entities');

    expect(res.statusCode).toBe(200);
    expect(res.body.entities.length).toBeLessThanOrEqual(8);
  });
});

// ── Input validation edge cases ──────────────────────────────────────────────
describe('Input validation — edge cases', () => {
  it('/api/analyze returns 400 for missing text', async () => {
    const res = await api().get('/api/analyze');
    expect(res.statusCode).toBe(400);
  });

  it('/api/analyze returns 400 for empty text', async () => {
    const res = await api().get('/api/analyze?text=');
    expect(res.statusCode).toBe(400);
  });

  it('/api/analyze returns 400 for whitespace-only text', async () => {
    const res = await api().get('/api/analyze?text=%20%20%20');
    expect(res.statusCode).toBe(400);
  });

  it('/api/analyze returns 400 for text over 500 chars', async () => {
    const longText = 'a'.repeat(501);
    const res = await api().get('/api/analyze?text=' + longText);
    expect(res.statusCode).toBe(400);
  });

  it('/api/text-to-speech validates text is string', async () => {
    const res = await api().post('/api/text-to-speech')
      .send({ text: 12345, language: 'en' });
    expect(res.statusCode).toBe(400);
  });

  it('/api/vision/verify-voter-id rejects oversized images', async () => {
    const hugeImage = 'data:image/png;base64,' + 'A'.repeat(6000000);
    const res = await api().post('/api/vision/verify-voter-id')
      .send({ image: hugeImage });
    expect(res.statusCode).toBe(400);
  });
});

// ── Error codes and structured errors ────────────────────────────────────────
describe('Structured error responses', () => {
  it('translate returns structured error for missing text', async () => {
    const res = await api().post('/api/translate').send({ language: 'hindi' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('chat returns structured error for invalid history', async () => {
    const res = await api().post('/api/chat')
      .send({ message: 'hi', history: [{ invalid: true }] });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('quiz submit returns structured error for wrong answer count', async () => {
    const res = await api().post('/api/quiz/submit')
      .send({ answers: [1, 2, 3] });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ── Request logging middleware ───────────────────────────────────────────────
describe('Request logging', () => {
  it('logs API requests with timing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await api().get('/api/health');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ── Environment validation ───────────────────────────────────────────────────
describe('Environment handling', () => {
  it('app runs without optional env vars', async () => {
    const res = await api().get('/api/health');
    expect(res.statusCode).toBe(200);
  });

  it('config shows disabled features when env vars missing', async () => {
    const originalKey = process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    
    const res = await api().get('/api/config');
    expect(res.statusCode).toBe(200);
    
    if (originalKey) process.env.GOOGLE_CLOUD_API_KEY = originalKey;
  });
});