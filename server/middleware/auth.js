import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET && process.env.VERCEL) {
  throw new Error('JWT_SECRET must be set when running on Vercel.');
}

const SECRET = process.env.JWT_SECRET || 'sic-events-scoring-dev-secret';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    req.judge = jwt.verify(token, SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function adminOnly(req, res, next) {
  if (!req.judge || !req.judge.is_admin) {
    return res.status(403).json({ message: 'Administrator access required.' });
  }
  next();
}
