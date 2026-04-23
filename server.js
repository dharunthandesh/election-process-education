/**
 * @fileoverview VoteWise India — Express backend server
 * @description AI-powered Indian election education assistant.
 *   Provides election data, Gemini-powered chat, quiz engine,
 *   Firebase Firestore persistence, and multilingual support.
 * @module server
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compress = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config();

// ── Firebase Admin initialisation ────────────────────────────────────────────
let db = null;
try {
  admin.initializeApp();          // uses Cloud Run default credentials
  db = admin.firestore();
  console.log('Firebase Firestore: connected');
} catch (e) {
  console.warn('Firebase Firestore: running without persistence —', e.message);
}

const app = express();
const PORT = process.env.PORT || 8080;

// ── Security & Middleware ─────────────────────────────────────────────────────

app.use(compress());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'",
        'https://www.gstatic.com',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      frameSrc: ['https://www.google.com', 'https://accounts.google.com', 'https://*.firebaseapp.com'],
      connectSrc: ["'self'",
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://firestore.googleapis.com',
        'https://www.google-analytics.com',
        'https://firebaseapp.com',
        'https://*.firebaseio.com',
        'https://generativelanguage.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// Set ALLOWED_ORIGIN env var in production to restrict cross-origin access
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '10kb' }));

// ── Rate Limiters ─────────────────────────────────────────────────────────────

/** Rate limiter for AI chat endpoint — 20 req/min per IP */
const chatLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});

/** General rate limiter for data endpoints — 100 req/min per IP */
const apiLimiter = rateLimit({
  windowMs: 60_000, max: 100,
  message: { error: 'Too many requests.' },
});

// ── In-memory Response Cache ──────────────────────────────────────────────────

/** @type {Map<string, {data: *, ts: number}>} */
const responseCache = new Map();

/** Cache TTL in milliseconds */
const CACHE_TTL = 30_000;

/**
 * Retrieves a cached response if it exists and has not expired.
 * @param {string} key - Cache key identifier
 * @returns {*|null} Cached data or null if miss/expired
 */
function getCached(key) {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

/**
 * Stores data in the in-memory response cache.
 * @param {string} key  - Cache key identifier
 * @param {*}      data - Data to cache
 */
function setCache(key, data) {
  responseCache.set(key, { data, ts: Date.now() });
}

// ── Election Knowledge Base ───────────────────────────────────────────────────

/**
 * @typedef {Object} ElectionStep
 * @property {number} step        - Step number
 * @property {string} title       - Step title
 * @property {string} description - Step description
 * @property {string} icon        - Emoji icon
 */

/**
 * @typedef {Object} QuizQuestion
 * @property {string}   id       - Unique question ID
 * @property {string}   q        - Question text
 * @property {string[]} options  - Answer options array
 * @property {number}   answer   - Index of correct answer
 * @property {string}   explain  - Explanation of the correct answer
 */

/** Core election data for India */
const ELECTION_DATA = {
  title: 'Indian Elections',
  subtitle: 'Lok Sabha, Vidhan Sabha & Local Body Elections',
  country: 'India',
  body: 'Election Commission of India (ECI)',
  website: 'https://eci.gov.in',

  keyFacts: [
    { label: 'Eligible Voters', value: '96.8 Crore', icon: '👥' },
    { label: 'Lok Sabha Seats', value: '543', icon: '🏛️' },
    { label: 'Polling Stations', value: '10.5 Lakh', icon: '🗳️' },
    { label: 'Recognised Parties', value: '6 National + 57 State', icon: '🎌' },
  ],

  electionTypes: [
    {
      id: 'lok-sabha',
      name: 'Lok Sabha',
      full: 'General Elections (Lok Sabha)',
      desc: 'Election to the Lower House of Parliament. 543 constituencies across India. Held every 5 years.',
      frequency: 'Every 5 years',
      seats: 543,
      lastHeld: '2024',
      nextDue: '2029',
      calStart: '20290401T000000Z',
      calEnd: '20290601T000000Z',
    },
    {
      id: 'rajya-sabha',
      name: 'Rajya Sabha',
      full: 'Rajya Sabha Elections',
      desc: 'Upper House elections. Members elected by state legislative assemblies for 6-year terms. One-third retire every 2 years.',
      frequency: 'Biennial (one-third)',
      seats: 245,
      lastHeld: '2024',
      nextDue: '2026',
      calStart: '20260301T000000Z',
      calEnd: '20260401T000000Z',
    },
    {
      id: 'vidhan-sabha',
      name: 'Vidhan Sabha',
      full: 'State Legislative Assembly Elections',
      desc: 'Elections to state assemblies. Each of the 28 states and 3 UTs with legislature holds separate elections.',
      frequency: 'Every 5 years (state-specific)',
      seats: 'Varies by state',
      lastHeld: '2024 (multiple states)',
      nextDue: '2025-2027 (state-specific)',
      calStart: '20251001T000000Z',
      calEnd: '20260101T000000Z',
    },
    {
      id: 'local-body',
      name: 'Local Body',
      full: 'Panchayat & Municipal Elections',
      desc: 'Elections for gram panchayats, municipal corporations, and local governing bodies. Conducted by State Election Commissions.',
      frequency: 'Every 5 years',
      seats: 'Varies',
      lastHeld: '2023-2024',
      nextDue: '2028-2029',
      calStart: '20280101T000000Z',
      calEnd: '20280401T000000Z',
    },
  ],

  votingSteps: [
    {
      step: 1, icon: '📋',
      title: 'Check Voter Registration',
      description: 'Verify you are registered on the electoral roll at voters.eci.gov.in or the Voter Helpline App. You need to be 18+ as of January 1 of the election year.',
    },
    {
      step: 2, icon: '🆔',
      title: 'Get Your EPIC Card',
      description: 'Obtain your Electors Photo Identity Card (EPIC/Voter ID) from your local Electoral Registration Officer or apply online via the National Voters Service Portal (NVSP).',
    },
    {
      step: 3, icon: '📅',
      title: 'Check Election Schedule',
      description: 'Monitor ECI announcements for Phase-wise election dates. The Model Code of Conduct comes into effect from the date of schedule announcement.',
    },
    {
      step: 4, icon: '📍',
      title: 'Find Your Polling Booth',
      description: 'Use the Voter Helpline (1950) or electoralsearch.eci.gov.in to find your assigned polling booth number and address.',
    },
    {
      step: 5, icon: '🗳️',
      title: 'Voting Day — Cast Your Vote',
      description: 'Arrive at your polling booth with EPIC or any approved alternate ID. Follow the queue, verify your name in the register, receive the ballot slip, and use the EVM.',
    },
    {
      step: 6, icon: '☑️',
      title: 'Using the EVM & VVPAT',
      description: 'Press the blue button next to your preferred candidate on the Electronic Voting Machine. A VVPAT slip appears for 7 seconds confirming your choice. Your vote is secret and secure.',
    },
    {
      step: 7, icon: '🖊️',
      title: 'Collect Indelible Ink Mark',
      description: 'After voting, indelible ink is applied to your left index finger. This prevents double voting and is a mark of democratic participation.',
    },
  ],

  registrationSteps: [
    { step: 1, title: 'Check Eligibility', desc: 'Indian citizen, 18+ years as of January 1 of qualifying year, ordinary resident of the constituency.' },
    { step: 2, title: 'Gather Documents', desc: 'Age proof (birth certificate/passport/class X certificate), address proof (Aadhaar/utility bill/bank passbook), passport-size photograph.' },
    { step: 3, title: 'Fill Form 6', desc: 'Visit voters.eci.gov.in or use the Voter Helpline App to fill Form 6 (new registration). NRIs use Form 6A.' },
    { step: 4, title: 'Submit Application', desc: 'Submit online or at your local Electoral Registration Office (ERO/AERO). Track application status on NVSP.' },
    { step: 5, title: 'Verification', desc: 'A Booth Level Officer (BLO) may visit your address for verification within 30 days.' },
    { step: 6, title: 'Receive EPIC', desc: 'Upon approval, collect your Voter ID card. Can also download e-EPIC from the NVSP portal.' },
  ],

  importantDates: [
    { id: 'd1', event: 'Rajya Sabha Biennial Elections', date: 'March 2026', type: 'election', calStart: '20260301T000000Z', calEnd: '20260401T000000Z' },
    { id: 'd2', event: 'Bihar Vidhan Sabha Elections', date: 'October–November 2025', type: 'election', calStart: '20251001T000000Z', calEnd: '20251201T000000Z' },
    { id: 'd3', event: 'Delhi Municipal Elections', date: '2025', type: 'local', calStart: '20250601T000000Z', calEnd: '20250801T000000Z' },
    { id: 'd4', event: 'Next Lok Sabha Elections', date: '2029', type: 'general', calStart: '20290401T000000Z', calEnd: '20290601T000000Z' },
    { id: 'd5', event: 'Voter List Revision (Annual)', date: 'October–January', type: 'admin', calStart: '20251001T000000Z', calEnd: '20260115T000000Z' },
  ],

  quizQuestions: [
    {
      id: 'q1',
      q: 'What is the minimum voting age in India?',
      options: ['16 years', '18 years', '21 years', '25 years'],
      answer: 1,
      explain: 'The 61st Constitutional Amendment (1989) lowered the voting age from 21 to 18 years.',
    },
    {
      id: 'q2',
      q: 'How many seats are there in the Lok Sabha?',
      options: ['450', '500', '543', '552'],
      answer: 2,
      explain: '543 elected seats in Lok Sabha. The President nominates 2 Anglo-Indian members (now discontinued after 104th Amendment).',
    },
    {
      id: 'q3',
      q: 'What does NOTA stand for?',
      options: [
        'No Option To Accept',
        'None Of The Above',
        'National Option To Abstain',
        'No Official Term Available',
      ],
      answer: 1,
      explain: 'NOTA (None Of The Above) was introduced by the Supreme Court in 2013, allowing voters to reject all candidates.',
    },
    {
      id: 'q4',
      q: 'Which body conducts Lok Sabha and Vidhan Sabha elections?',
      options: [
        'State Election Commission',
        'Ministry of Home Affairs',
        'Election Commission of India',
        'Supreme Court of India',
      ],
      answer: 2,
      explain: 'The Election Commission of India (ECI), an independent constitutional body, conducts elections to Parliament and State Legislatures.',
    },
    {
      id: 'q5',
      q: 'What is EVM?',
      options: [
        'Electronic Voting Machine',
        'Election Verification Method',
        'Electoral Vote Monitor',
        'Electronic Voter Module',
      ],
      answer: 0,
      explain: 'EVM (Electronic Voting Machine) has been used in Indian elections since 1982. It replaced paper ballots to reduce fraud and errors.',
    },
    {
      id: 'q6',
      q: 'What is the VVPAT?',
      options: [
        'Verified Voter Paper Audit Trail',
        'Voter Verified Paper Audit Trail',
        'Valid Vote Paper Audit Track',
        'Voting Verification Process Audit Trail',
      ],
      answer: 1,
      explain: 'VVPAT (Voter Verified Paper Audit Trail) prints a slip for 7 seconds showing the voter their choice, ensuring EVM accuracy.',
    },
    {
      id: 'q7',
      q: 'What is the Model Code of Conduct?',
      options: [
        'Rules for journalists covering elections',
        'Guidelines for voters on polling day',
        'Conduct rules for candidates and parties during elections',
        'ECI internal operational manual',
      ],
      answer: 2,
      explain: 'The Model Code of Conduct (MCC) is a set of guidelines for political parties and candidates during elections, enforced from schedule announcement to result day.',
    },
    {
      id: 'q8',
      q: 'Which form is used for new voter registration in India?',
      options: ['Form 3', 'Form 6', 'Form 8', 'Form 10'],
      answer: 1,
      explain: 'Form 6 is used for new voter enrollment. Form 6A is for NRIs, Form 7 for deletion, and Form 8 for corrections.',
    },
    {
      id: 'q9',
      q: 'What is the Voter Helpline number in India?',
      options: ['1800', '1950', '1100', '104'],
      answer: 1,
      explain: 'Voter Helpline 1950 connects citizens to Electoral Registration Officers for booth info, registration queries, and complaints.',
    },
    {
      id: 'q10',
      q: 'How long is the term of a Rajya Sabha member?',
      options: ['2 years', '4 years', '5 years', '6 years'],
      answer: 3,
      explain: 'Rajya Sabha members serve 6-year terms. One-third of members retire every 2 years, making it a permanent house — it is never fully dissolved.',
    },
  ],

  announcements: [
    { id: 'a1', text: 'Voter registration open for 2025-26 rolls. Apply at voters.eci.gov.in', type: 'info', time: 'Latest' },
    { id: 'a2', text: 'Download your e-EPIC (digital Voter ID) instantly from the NVSP portal', type: 'success', time: 'New Feature' },
    { id: 'a3', text: 'Bihar Assembly Elections scheduled for late 2025. Check ECI for official dates.', type: 'warning', time: 'Upcoming' },
    { id: 'a4', text: 'Voter Helpline 1950 now available 24x7 during election season', type: 'info', time: 'Update' },
    { id: 'a5', text: 'Supreme Court mandates 100% VVPAT verification in phased manner', type: 'info', time: 'Policy' },
  ],
};

// ── Constitutional Bodies Data ────────────────────────────────────────────────

/**
 * @typedef {Object} StateInfo
 * @property {string} name        - State or UT name
 * @property {string} capital     - Capital city
 * @property {number|string} vidhanSabhaSeats - Seats in state legislature
 * @property {number} rajyaSabhaSeats - Seats in Rajya Sabha
 * @property {number} lokSabhaSeats   - Seats in Lok Sabha
 * @property {string} type        - 'state' or 'ut'
 * @property {string} region      - Geographic region
 */

/** All 28 Indian states with electoral data */
const STATES = [
  { name: 'Andhra Pradesh', capital: 'Amaravati', vidhanSabhaSeats: 175, rajyaSabhaSeats: 11, lokSabhaSeats: 25, type: 'state', region: 'South' },
  { name: 'Arunachal Pradesh', capital: 'Itanagar', vidhanSabhaSeats: 60, rajyaSabhaSeats: 1, lokSabhaSeats: 2, type: 'state', region: 'North East' },
  { name: 'Assam', capital: 'Dispur', vidhanSabhaSeats: 126, rajyaSabhaSeats: 7, lokSabhaSeats: 14, type: 'state', region: 'North East' },
  { name: 'Bihar', capital: 'Patna', vidhanSabhaSeats: 243, rajyaSabhaSeats: 16, lokSabhaSeats: 40, type: 'state', region: 'East' },
  { name: 'Chhattisgarh', capital: 'Raipur', vidhanSabhaSeats: 90, rajyaSabhaSeats: 5, lokSabhaSeats: 11, type: 'state', region: 'Central' },
  { name: 'Goa', capital: 'Panaji', vidhanSabhaSeats: 40, rajyaSabhaSeats: 1, lokSabhaSeats: 2, type: 'state', region: 'West' },
  { name: 'Gujarat', capital: 'Gandhinagar', vidhanSabhaSeats: 182, rajyaSabhaSeats: 11, lokSabhaSeats: 26, type: 'state', region: 'West' },
  { name: 'Haryana', capital: 'Chandigarh', vidhanSabhaSeats: 90, rajyaSabhaSeats: 5, lokSabhaSeats: 10, type: 'state', region: 'North' },
  { name: 'Himachal Pradesh', capital: 'Shimla', vidhanSabhaSeats: 68, rajyaSabhaSeats: 3, lokSabhaSeats: 4, type: 'state', region: 'North' },
  { name: 'Jharkhand', capital: 'Ranchi', vidhanSabhaSeats: 81, rajyaSabhaSeats: 6, lokSabhaSeats: 14, type: 'state', region: 'East' },
  { name: 'Karnataka', capital: 'Bengaluru', vidhanSabhaSeats: 224, rajyaSabhaSeats: 12, lokSabhaSeats: 28, type: 'state', region: 'South' },
  { name: 'Kerala', capital: 'Thiruvananthapuram', vidhanSabhaSeats: 140, rajyaSabhaSeats: 9, lokSabhaSeats: 20, type: 'state', region: 'South' },
  { name: 'Madhya Pradesh', capital: 'Bhopal', vidhanSabhaSeats: 230, rajyaSabhaSeats: 11, lokSabhaSeats: 29, type: 'state', region: 'Central' },
  { name: 'Maharashtra', capital: 'Mumbai', vidhanSabhaSeats: 288, rajyaSabhaSeats: 19, lokSabhaSeats: 48, type: 'state', region: 'West' },
  { name: 'Manipur', capital: 'Imphal', vidhanSabhaSeats: 60, rajyaSabhaSeats: 1, lokSabhaSeats: 2, type: 'state', region: 'North East' },
  { name: 'Meghalaya', capital: 'Shillong', vidhanSabhaSeats: 60, rajyaSabhaSeats: 1, lokSabhaSeats: 2, type: 'state', region: 'North East' },
  { name: 'Mizoram', capital: 'Aizawl', vidhanSabhaSeats: 40, rajyaSabhaSeats: 1, lokSabhaSeats: 1, type: 'state', region: 'North East' },
  { name: 'Nagaland', capital: 'Kohima', vidhanSabhaSeats: 60, rajyaSabhaSeats: 1, lokSabhaSeats: 1, type: 'state', region: 'North East' },
  { name: 'Odisha', capital: 'Bhubaneswar', vidhanSabhaSeats: 147, rajyaSabhaSeats: 10, lokSabhaSeats: 21, type: 'state', region: 'East' },
  { name: 'Punjab', capital: 'Chandigarh', vidhanSabhaSeats: 117, rajyaSabhaSeats: 7, lokSabhaSeats: 13, type: 'state', region: 'North' },
  { name: 'Rajasthan', capital: 'Jaipur', vidhanSabhaSeats: 200, rajyaSabhaSeats: 10, lokSabhaSeats: 25, type: 'state', region: 'North' },
  { name: 'Sikkim', capital: 'Gangtok', vidhanSabhaSeats: 32, rajyaSabhaSeats: 1, lokSabhaSeats: 1, type: 'state', region: 'North East' },
  { name: 'Tamil Nadu', capital: 'Chennai', vidhanSabhaSeats: 234, rajyaSabhaSeats: 18, lokSabhaSeats: 39, type: 'state', region: 'South' },
  { name: 'Telangana', capital: 'Hyderabad', vidhanSabhaSeats: 119, rajyaSabhaSeats: 7, lokSabhaSeats: 17, type: 'state', region: 'South' },
  { name: 'Tripura', capital: 'Agartala', vidhanSabhaSeats: 60, rajyaSabhaSeats: 1, lokSabhaSeats: 2, type: 'state', region: 'North East' },
  { name: 'Uttar Pradesh', capital: 'Lucknow', vidhanSabhaSeats: 403, rajyaSabhaSeats: 31, lokSabhaSeats: 80, type: 'state', region: 'North' },
  { name: 'Uttarakhand', capital: 'Dehradun', vidhanSabhaSeats: 70, rajyaSabhaSeats: 3, lokSabhaSeats: 5, type: 'state', region: 'North' },
  { name: 'West Bengal', capital: 'Kolkata', vidhanSabhaSeats: 294, rajyaSabhaSeats: 16, lokSabhaSeats: 42, type: 'state', region: 'East' },
];

/** All 8 Union Territories with electoral data */
const UNION_TERRITORIES = [
  { name: 'Andaman & Nicobar Islands', capital: 'Port Blair', vidhanSabhaSeats: 'No legislature', rajyaSabhaSeats: 0, lokSabhaSeats: 1, type: 'ut', region: 'Island' },
  { name: 'Chandigarh', capital: 'Chandigarh', vidhanSabhaSeats: 'No legislature', rajyaSabhaSeats: 0, lokSabhaSeats: 1, type: 'ut', region: 'North' },
  { name: 'Dadra & Nagar Haveli and Daman & Diu', capital: 'Daman', vidhanSabhaSeats: 'No legislature', rajyaSabhaSeats: 0, lokSabhaSeats: 2, type: 'ut', region: 'West' },
  { name: 'Delhi (NCT)', capital: 'New Delhi', vidhanSabhaSeats: 70, rajyaSabhaSeats: 3, lokSabhaSeats: 7, type: 'ut', region: 'North' },
  { name: 'Jammu & Kashmir', capital: 'Srinagar/Jammu', vidhanSabhaSeats: 90, rajyaSabhaSeats: 4, lokSabhaSeats: 6, type: 'ut', region: 'North' },
  { name: 'Ladakh', capital: 'Leh', vidhanSabhaSeats: 'No legislature', rajyaSabhaSeats: 0, lokSabhaSeats: 1, type: 'ut', region: 'North' },
  { name: 'Lakshadweep', capital: 'Kavaratti', vidhanSabhaSeats: 'No legislature', rajyaSabhaSeats: 0, lokSabhaSeats: 1, type: 'ut', region: 'Island' },
  { name: 'Puducherry', capital: 'Puducherry', vidhanSabhaSeats: 30, rajyaSabhaSeats: 1, lokSabhaSeats: 1, type: 'ut', region: 'South' },
];

/** Detailed Lok Sabha information */
const LOK_SABHA = {
  name: 'Lok Sabha',
  fullName: 'House of the People (Lower House of Parliament)',
  totalSeats: 543,
  term: '5 years',
  currentTerm: '18th Lok Sabha (2024–2029)',
  electedBy: 'Direct election by eligible voters (First-Past-The-Post system)',
  eligibility: 'Indian citizen, 25+ years of age',
  speaker: 'Om Birla (as of 2024)',
  specialSeats: '131 seats reserved (84 SC + 47 ST)',
  quorum: '10% of total membership (55 members)',
  keyFunctions: [
    'Passes Union Budget and Money Bills',
    'Votes of No Confidence against the government',
    'Amends the Constitution (with special majority)',
    'Declares war and ratifies treaties',
    'Elects the President jointly with Rajya Sabha and state legislatures',
  ],
  regions: [
    { region: 'North India', seats: 225 },
    { region: 'South India', seats: 130 },
    { region: 'West India', seats: 84 },
    { region: 'East India', seats: 72 },
    { region: 'North East India', seats: 25 },
    { region: 'UTs', seats: 7 },
  ],
};

/** Detailed Rajya Sabha information */
const RAJYA_SABHA = {
  name: 'Rajya Sabha',
  fullName: 'Council of States (Upper House of Parliament)',
  totalSeats: 245,
  electedSeats: 233,
  nominatedSeats: 12,
  term: '6 years (one-third retire every 2 years)',
  currentStrength: 245,
  electedBy: 'Indirect election by elected members of State Legislative Assemblies and UTs',
  eligibility: 'Indian citizen, 30+ years of age',
  chairman: 'Vice President of India (ex officio)',
  deputyChairman: 'Elected by Rajya Sabha members',
  isPermanent: true,
  keyFunctions: [
    'Represents the interests of states and UTs at the national level',
    'Reviews and can amend Bills passed by Lok Sabha',
    'Cannot be dissolved — a permanent house',
    'Nominates 12 members with expertise in art, literature, science, social service',
    'Special powers over State List subjects (Article 249)',
  ],
  stateSeats: [
    { state: 'Uttar Pradesh', seats: 31 },
    { state: 'Maharashtra', seats: 19 },
    { state: 'Tamil Nadu', seats: 18 },
    { state: 'Bihar', seats: 16 },
    { state: 'West Bengal', seats: 16 },
    { state: 'Karnataka', seats: 12 },
    { state: 'Andhra Pradesh', seats: 11 },
    { state: 'Gujarat', seats: 11 },
    { state: 'Madhya Pradesh', seats: 11 },
    { state: 'Others', seats: 83 },
  ],
};

/** Presidential election process */
const PRESIDENT = {
  title: 'President of India',
  currentPresident: 'Droupadi Murmu (15th President, since July 2022)',
  term: '5 years',
  eligibility: [
    'Indian citizen',
    '35+ years of age',
    'Qualified to be elected as a member of the Lok Sabha',
    'Must not hold any office of profit under the Government',
  ],
  electedBy: 'Electoral College comprising elected members of both Houses of Parliament AND elected members of all State Legislative Assemblies and Delhi & Puducherry legislatures',
  votingSystem: 'Single Transferable Vote with proportional representation',
  totalVoteValue: 'Each MP vote = sum of all MLA votes / total MPs (ensures balance between Parliament and states)',
  process: [
    { step: 1, title: 'Nomination', desc: 'Candidate needs 50 proposers and 50 seconders from the Electoral College. Security deposit of ₹15,000.' },
    { step: 2, title: 'Election Commission', desc: 'ECI conducts the election. Voting is by secret ballot using a special pen.' },
    { step: 3, title: 'Preferential Voting', desc: 'Voters mark preferences (1, 2, 3…) against candidates rather than just one choice.' },
    { step: 4, title: 'Vote Counting', desc: 'Counting uses Single Transferable Vote — if no candidate gets majority, lowest candidate eliminated and votes redistributed.' },
    { step: 5, title: 'Oath & Assumption', desc: 'Elected President takes oath before the Chief Justice of India in the Central Hall of Parliament.' },
  ],
  powers: [
    'Head of State and Supreme Commander of Armed Forces',
    'Appoints Prime Minister, Governors, Chief Justice, and other judges',
    'Summons, prorogues, and dissolves Parliament',
    'Gives assent to Bills (can return non-Money Bills once)',
    'Declares National Emergency, President\'s Rule, and Financial Emergency',
  ],
  vicePresident: {
    title: 'Vice President of India',
    current: 'Jagdeep Dhankhar (14th Vice President, since August 2022)',
    role: 'Ex-officio Chairman of Rajya Sabha; acts as President when office is vacant',
    electedBy: 'Electoral College of both Houses of Parliament (not state legislatures)',
    term: '5 years',
  },
};

// ── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Builds the Gemini system prompt with full election knowledge context.
 * @returns {string} Complete system prompt string
 */
function buildSystemPrompt() {
  const steps = ELECTION_DATA.votingSteps
    .map(s => `  Step ${s.step}: ${s.title} — ${s.description}`)
    .join('\n');

  const types = ELECTION_DATA.electionTypes
    .map(t => `  • ${t.name}: ${t.desc} (Next: ${t.nextDue})`)
    .join('\n');

  return `You are VoteWise AI, an expert assistant on Indian elections and the democratic process.

MISSION: Help Indian citizens understand how elections work, how to vote, how to register, and their rights.

KEY FACTS:
- Governed by: Election Commission of India (ECI) at eci.gov.in
- Eligible voters: ${ELECTION_DATA.keyFacts[0].value}
- Lok Sabha seats: ${ELECTION_DATA.keyFacts[1].value}
- Polling stations: ${ELECTION_DATA.keyFacts[2].value}
- Voting age: 18 years (since 61st Constitutional Amendment, 1989)
- Voter Helpline: 1950

ELECTION TYPES:
${types}

HOW TO VOTE (Step by Step):
${steps}

VOTER REGISTRATION:
- Apply online at voters.eci.gov.in or Voter Helpline App
- Fill Form 6 (new registration), Form 6A (NRI), Form 8 (corrections)
- Documents: age proof + address proof + photo
- Track status on NVSP portal

KEY TERMS:
- EVM: Electronic Voting Machine (used since 1982)
- VVPAT: Voter Verified Paper Audit Trail (7-second slip confirmation)
- EPIC: Electors Photo Identity Card (Voter ID)
- NOTA: None Of The Above (introduced 2013 by Supreme Court)
- MCC: Model Code of Conduct (guidelines for candidates/parties during elections)
- BLO: Booth Level Officer (local election official)
- ERO: Electoral Registration Officer

PARLIAMENT:
- Lok Sabha: 543 seats, 5-year term, direct vote, 25+ age, Speaker: Om Birla
  • 131 reserved seats (84 SC + 47 ST), current: 18th Lok Sabha (2024-2029)
- Rajya Sabha: 245 seats (233 elected + 12 nominated), 6-year term, never dissolved
  • Elected by state MLAs, Chairman = Vice President, 30+ age
  • Largest delegations: UP (31), Maharashtra (19), Tamil Nadu (18)

PRESIDENT & VICE PRESIDENT:
- President: Droupadi Murmu (15th, since July 2022), 5-year term
  • Elected by Electoral College = elected MPs + elected MLAs
  • Uses Single Transferable Vote (preferential voting)
  • Eligibility: Indian citizen, 35+, no office of profit
- Vice President: Jagdeep Dhankhar (14th, since Aug 2022)
  • Ex-officio Chairman of Rajya Sabha

TOP STATES BY LOK SABHA SEATS:
- UP: 80 | Maharashtra: 48 | West Bengal: 42 | Bihar: 40
- Tamil Nadu: 39 | Karnataka: 28 | Gujarat: 26

IMPORTANT RESOURCES:
- Voter registration: voters.eci.gov.in
- Booth search: electoralsearch.eci.gov.in
- Candidate affidavits: affidavit.eci.gov.in
- Helpline: 1950

YOUR BEHAVIOUR:
- Be helpful, accurate, and encouraging about democratic participation
- Use simple language accessible to first-time voters
- Answer in the same language as the question (Hindi or English)
- When asked in Hindi, respond in Hindi
- Do NOT fabricate election results, candidate names, or specific vote counts
- Always encourage citizens to verify on official ECI sources
- Be politically neutral — never favour any party or candidate`;
}

/**
 * Translates text to the specified Indian language using Gemini API.
 * Falls back to a demo response if no API key is configured.
 * @param {string} text     - Text to translate
 * @param {string} language - Target language (hindi, tamil, telugu, etc.)
 * @param {string} apiKey   - Gemini API key
 * @returns {Promise<string>} Translated text
 */
async function translateWithGemini(text, language, apiKey) {
  if (!apiKey) {
    return `[Demo] "${text}" translated to ${language}`;
  }

  const prompt = `Translate the following text to ${language}. Return only the translated text, nothing else:\n\n${text}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini translate error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? text;
}

/**
 * Saves a quiz score to Firestore for leaderboard tracking.
 * Silently skips if Firestore is not configured.
 * @param {string} sessionId - Anonymous session identifier
 * @param {number} score     - Number of correct answers
 * @param {number} total     - Total number of questions
 * @returns {Promise<void>}
 */
async function saveQuizScore(sessionId, score, total) {
  if (!db) return;
  try {
    await db.collection('quizScores').add({
      sessionId,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore write failed:', err.message);
  }
}

/**
 * Retrieves top quiz scores from Firestore for leaderboard display.
 * Returns empty array if Firestore is not configured or query fails.
 * @param {number} [limit=10] - Maximum number of scores to return
 * @returns {Promise<Array>} Array of score objects
 */
async function getTopScores(limit = 10) {
  if (!db) return [];
  try {
    const snap = await db.collection('quizScores')
      .orderBy('percentage', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Firestore read failed:', err.message);
    return [];
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────

/**
 * @route  GET /api/health
 * @desc   Health check for Cloud Run uptime monitoring
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'VoteWise India', timestamp: new Date().toISOString() });
});

/**
 * @route  GET /api/config
 * @desc   Serves Firebase client config from environment variables.
 *         Keeps API keys out of the frontend source code.
 */
app.get('/api/config', apiLimiter, (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || '',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
    },
    features: {
      auth: !!process.env.FIREBASE_API_KEY,
      analytics: !!process.env.FIREBASE_MEASUREMENT_ID,
      translate: !!process.env.GEMINI_API_KEY,
    },
  });
});

/**
 * @route  GET /api/election
 * @desc   Returns core election metadata, key facts and election types
 */
app.get('/api/election', apiLimiter, (_req, res) => {
  const cached = getCached('election');
  if (cached) return res.set('X-Cache', 'HIT').set('Cache-Control', 'public, max-age=300').json(cached);

  const { quizQuestions, ...data } = ELECTION_DATA;
  setCache('election', data);
  res.set('X-Cache', 'MISS').set('Cache-Control', 'public, max-age=300').json(data);
});

/**
 * @route  GET /api/steps
 * @desc   Returns step-by-step voting guide
 */
app.get('/api/steps', apiLimiter, (_req, res) => {
  const cached = getCached('steps');
  if (cached) return res.set('X-Cache', 'HIT').json(cached);
  const data = { votingSteps: ELECTION_DATA.votingSteps, registrationSteps: ELECTION_DATA.registrationSteps };
  setCache('steps', data);
  res.set('X-Cache', 'MISS').json(data);
});

/**
 * @route  GET /api/quiz
 * @desc   Returns all quiz questions (without answers for client fairness)
 */
app.get('/api/quiz', apiLimiter, (_req, res) => {
  const questions = ELECTION_DATA.quizQuestions.map(({ answer, explain, ...q }) => q);
  res.set('Cache-Control', 'public, max-age=600').json({ questions, total: questions.length });
});

/**
 * @route  POST /api/quiz/submit
 * @desc   Validates quiz answers, returns score and explanations,
 *         persists score to Firestore
 */
app.post('/api/quiz/submit', apiLimiter, async (req, res) => {
  const { answers, sessionId } = req.body;

  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers must be an array.' });
  }
  if (answers.length !== ELECTION_DATA.quizQuestions.length) {
    return res.status(400).json({ error: `Expected ${ELECTION_DATA.quizQuestions.length} answers.` });
  }
  if (!answers.every(a => typeof a === 'number')) {
    return res.status(400).json({ error: 'Each answer must be a number (option index).' });
  }

  const results = ELECTION_DATA.quizQuestions.map((q, i) => ({
    id: q.id,
    question: q.q,
    yourAnswer: answers[i],
    correct: q.answer,
    isCorrect: answers[i] === q.answer,
    explain: q.explain,
  }));

  const score = results.filter(r => r.isCorrect).length;
  const total = results.length;
  const sid = typeof sessionId === 'string' ? sessionId.slice(0, 64) : 'anonymous';

  if (!answers.includes(-1)) {
    await saveQuizScore(sid, score, total);
  }

  res.json({ score, total, percentage: Math.round((score / total) * 100), results });
});

/**
 * @route  GET /api/leaderboard
 * @desc   Returns top quiz scores from Firestore
 */
app.get('/api/leaderboard', apiLimiter, async (_req, res) => {
  const scores = await getTopScores(10);
  res.json({ scores });
});

/**
 * @route  GET /api/dates
 * @desc   Returns upcoming important election dates with Google Calendar links
 */
app.get('/api/dates', apiLimiter, (_req, res) => {
  const cached = getCached('dates');
  if (cached) return res.set('X-Cache', 'HIT').json(cached);

  const dates = ELECTION_DATA.importantDates.map(d => ({
    ...d,
    calUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(d.event)}` +
      `&dates=${d.calStart}/${d.calEnd}` +
      `&details=${encodeURIComponent('Indian Election Event — VoteWise India')}` +
      `&location=${encodeURIComponent('India')}`,
  }));

  setCache('dates', { dates });
  res.set('X-Cache', 'MISS').json({ dates });
});

/**
 * @route  GET /api/announcements
 * @desc   Returns latest election news and ECI announcements
 */
app.get('/api/announcements', apiLimiter, (_req, res) => {
  res.json({ announcements: ELECTION_DATA.announcements });
});
/**
 * @route  GET /api/states
 * @desc   Returns all 28 states and 8 UTs with electoral seat data.
 *         Supports optional ?region= and ?type=state|ut filters.
 */
app.get('/api/states', apiLimiter, (req, res) => {
  const { region, type } = req.query;
  let states = [...STATES, ...UNION_TERRITORIES];
  if (type && (type === 'state' || type === 'ut')) states = states.filter(s => s.type === type);
  if (region) states = states.filter(s => s.region.toLowerCase() === decodeURIComponent(region).toLowerCase());
  res.set('Cache-Control', 'public, max-age=3600').json({
    states, total: states.length,
    totalStates: STATES.length, totalUTs: UNION_TERRITORIES.length,
  });
});

/**
 * @route  GET /api/parliament
 * @desc   Returns detailed Lok Sabha and Rajya Sabha information
 */
app.get('/api/parliament', apiLimiter, (_req, res) => {
  const cached = getCached('parliament');
  if (cached) return res.set('X-Cache', 'HIT').set('Cache-Control', 'public, max-age=3600').json(cached);
  const data = { lokSabha: LOK_SABHA, rajyaSabha: RAJYA_SABHA };
  setCache('parliament', data);
  res.set('X-Cache', 'MISS').set('Cache-Control', 'public, max-age=3600').json(data);
});

/**
 * @route  GET /api/president
 * @desc   Returns Presidential and Vice Presidential election information
 */
app.get('/api/president', apiLimiter, (_req, res) => {
  const cached = getCached('president');
  if (cached) return res.set('X-Cache', 'HIT').set('Cache-Control', 'public, max-age=3600').json(cached);
  setCache('president', PRESIDENT);
  res.set('X-Cache', 'MISS').set('Cache-Control', 'public, max-age=3600').json(PRESIDENT);
});

/**
 * @route  POST /api/translate
 * @desc   Translates election-related text to Indian regional languages
 *         using Gemini API
 */
app.post('/api/translate', chatLimiter, async (req, res) => {
  const SUPPORTED = ['hindi', 'tamil', 'telugu', 'kannada', 'marathi', 'bengali', 'gujarati', 'punjabi'];
  const { text, language } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required and must be a string.' });
  }
  if (text.trim().length === 0) {
    return res.status(400).json({ error: 'text cannot be empty.' });
  }
  if (text.length > 1000) {
    return res.status(400).json({ error: 'text too long. Max 1000 characters.' });
  }
  if (!language || !SUPPORTED.includes(language.toLowerCase())) {
    return res.status(400).json({ error: `Unsupported language. Choose from: ${SUPPORTED.join(', ')}.` });
  }

  try {
    const translated = await translateWithGemini(text, language, process.env.GEMINI_API_KEY);
    res.json({ original: text, translated, language });
  } catch (err) {
    console.error('Translation error:', err.message);
    res.status(502).json({ error: 'Translation service unavailable. Please try again.' });
  }
});

/**
 * @route  POST /api/chat
 * @desc   Proxies chat messages to Gemini API with election context injected.
 *         API key is kept server-side and never exposed to the browser.
 */
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required and must be a string.' });
  }
  if (message.trim().length === 0) {
    return res.status(400).json({ error: 'message cannot be empty.' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ error: 'message too long. Max 1000 characters.' });
  }
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: 'history must be an array.' });
  }

  const VALID_ROLES = new Set(['user', 'model']);
  const historyValid = history.every(
    h => h && typeof h.role === 'string' && VALID_ROLES.has(h.role) && typeof h.text === 'string'
  );
  if (!historyValid) {
    return res.status(400).json({ error: 'history items must have role (user|model) and text fields.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.json({
      reply: "👋 Namaste! I'm **VoteWise AI**, your Indian elections guide.\n\nI'm running in demo mode. Once configured with Gemini API, I can answer:\n• How do I register to vote?\n• What is NOTA?\n• How does the EVM work?\n• When are the next elections?\n\nContact: Voter Helpline **1950**",
      demo: true,
    });
  }

  try {
    const contents = [
      ...history.slice(-10).map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message.trim() }] },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt() }] },
          contents,
          generationConfig: { maxOutputTokens: 512, temperature: 0.4, topP: 0.9 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      console.error('Gemini error:', geminiRes.status, errBody);
      return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) return res.status(502).json({ error: 'Empty response from AI. Please try again.' });

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Static Files & SPA Fallback ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`VoteWise India on http://localhost:${PORT}`);
    console.log(`Gemini: ${process.env.GEMINI_API_KEY ? 'configured ✓' : 'demo mode'}`);
    console.log(`Firestore: ${db ? 'connected ✓' : 'not configured'}`);
  });
}

module.exports = { app, server, ELECTION_DATA };