import { Router } from 'express';
import {
  login,
  megaSso,
  register,
  getProfile,
  verifyToken,
  authValidators
} from '../controllers/authController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { superAdminOnly } from '../middleware/tenant';

const router = Router();

// Rotas públicas
router.post('/login', authValidators.login, login);
router.post('/mega-sso', megaSso);

// Rotas protegidas
router.get('/profile', authMiddleware, getProfile);
router.get('/verify', authMiddleware, verifyToken);

// Rotas de admin (SUPERADMIN pode criar usuários para qualquer tenant)
router.post('/register', authMiddleware, superAdminOnly, authValidators.register, register);

export default router;
