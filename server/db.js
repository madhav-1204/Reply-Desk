const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_PROFILE = {
  businessName: 'Maple Street Bakery',
  businessType: 'Bakery and cafe',
  ownerName: 'Sarah Jenkins',
  preferredSignoff: 'Warm regards,\nSarah & the Maple Street Team',
  toneNotes: 'Warm, sincere, casual. Never use excessive exclamation marks.',
  neverSay: 'Never promise refunds, discounts, or free items. Never admit legal liability.'
};

const DEFAULT_DATA = {
  profile: DEFAULT_PROFILE,
  history: []
};

// Ensure data directory and db file exist
function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }
}

function readData() {
  try {
    initDB();
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json, returning default data:', err.message);
    return DEFAULT_DATA;
  }
}

function writeData(data) {
  initDB();
  const tmpFile = `${DB_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

function getProfile() {
  const data = readData();
  return data.profile || DEFAULT_PROFILE;
}

function saveProfile(newProfile) {
  const data = readData();
  data.profile = {
    businessName: (newProfile.businessName || '').trim(),
    businessType: (newProfile.businessType || '').trim(),
    ownerName: (newProfile.ownerName || '').trim(),
    preferredSignoff: (newProfile.preferredSignoff || '').trim(),
    toneNotes: (newProfile.toneNotes || '').trim(),
    neverSay: (newProfile.neverSay || '').trim()
  };
  writeData(data);
  return data.profile;
}

function getHistory(search = '') {
  const data = readData();
  const list = data.history || [];
  const query = (search || '').trim().toLowerCase();

  const filtered = query
    ? list.filter(item => {
        return (
          (item.reviewText && item.reviewText.toLowerCase().includes(query)) ||
          (item.replyText && item.replyText.toLowerCase().includes(query)) ||
          (item.sentiment && item.sentiment.toLowerCase().includes(query)) ||
          (item.tone && item.tone.toLowerCase().includes(query))
        );
      })
    : list;

  // Return sorted descending by createdAt
  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addHistoryItem({ reviewText, starRating, sentiment, tone, length, replyText }) {
  const data = readData();
  if (!data.history) data.history = [];

  const newItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reviewText: (reviewText || '').trim(),
    starRating: typeof starRating === 'number' ? starRating : null,
    sentiment: sentiment || 'neutral',
    tone: tone || 'friendly',
    length: length || 'short',
    replyText: (replyText || '').trim()
  };

  data.history.unshift(newItem);
  writeData(data);
  return newItem;
}

function deleteHistoryItem(id) {
  const data = readData();
  if (!data.history) return false;
  const initialLen = data.history.length;
  data.history = data.history.filter(item => item.id !== id);
  if (data.history.length !== initialLen) {
    writeData(data);
    return true;
  }
  return false;
}

module.exports = {
  getProfile,
  saveProfile,
  getHistory,
  addHistoryItem,
  deleteHistoryItem
};
