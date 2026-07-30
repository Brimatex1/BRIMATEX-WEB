const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.jsonl');
const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.jsonl');

function ensureFiles() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '');
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, '');
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createUser(phone, password, name) {
  ensureFiles();
  const users = readUsers();

  if (users.find(u => u.phone === phone)) {
    return null;
  }

  const user = {
    id: crypto.randomUUID(),
    email: `user_${Date.now()}@brimatex.local`,
    passwordHash: hashPassword(password),
    name: name.trim(),
    phone: phone.trim(),
    createdAt: new Date().toISOString(),
    addresses: [],
    wishlist: [],
    orders: []
  };

  fs.appendFileSync(USERS_FILE, JSON.stringify(user) + '\n');
  return user;
}

function authenticate(phone, password) {
  ensureFiles();
  const users = readUsers();
  const user = users.find(u => u.phone === phone);

  if (!user) return null;
  if (user.passwordHash !== hashPassword(password)) return null;

  return user;
}

function createSession(userId) {
  ensureFiles();
  const token = generateToken();
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };

  fs.appendFileSync(SESSIONS_FILE, JSON.stringify(session) + '\n');
  return token;
}

function verifySession(token) {
  ensureFiles();
  const sessions = readSessions();
  const session = sessions.find(s => s.token === token);

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  return session;
}

function getUser(userId) {
  ensureFiles();
  const users = readUsers();
  return users.find(u => u.id === userId) || null;
}

function updateUser(userId, updates) {
  ensureFiles();
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);

  if (idx === -1) return null;

  users[idx] = { ...users[idx], ...updates };
  fs.writeFileSync(USERS_FILE, users.map(u => JSON.stringify(u)).join('\n') + '\n');

  return users[idx];
}

function readUsers() {
  ensureFiles();
  try {
    const content = fs.readFileSync(USERS_FILE, 'utf8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function readSessions() {
  ensureFiles();
  try {
    const content = fs.readFileSync(SESSIONS_FILE, 'utf8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

module.exports = {
  createUser,
  authenticate,
  createSession,
  verifySession,
  getUser,
  updateUser
};
