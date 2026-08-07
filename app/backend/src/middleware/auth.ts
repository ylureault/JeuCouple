import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Le secret servait de valeur par defaut EN DUR ('your-secret-key-change-in-
// production') : n'importe qui lisant le depot pouvait forger un token admin.
// Sans JWT_SECRET, on genere desormais un secret aleatoire par demarrage :
// les sessions admin sautent au redemarrage du serveur, mais personne ne peut
// signer de token avec une constante publique.
const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  console.warn('[SECURITE] JWT_SECRET non defini : secret aleatoire genere pour ce demarrage (les sessions admin ne survivront pas a un redemarrage).');
  return crypto.randomBytes(32).toString('hex');
})();

export interface AuthRequest extends Request {
  adminId?: number;
}

export function generateToken(adminId: number): string {
  return jwt.sign({ adminId }, JWT_SECRET, { expiresIn: '24h' });
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'No authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId: number };
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
