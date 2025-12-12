import { Router, Response } from 'express';
import { authMiddleware, generateToken, AuthRequest } from '../middleware/auth.js';
import * as adminModel from '../models/admin.js';
import * as questionModel from '../models/question.js';
import * as roomModel from '../models/room.js';
import * as gameModel from '../models/game.js';
import type { AdminStats, QuestionImport } from '../../../shared/types.js';

const router = Router();

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  if (adminModel.verifyAdmin(email, password)) {
    const token = generateToken(1);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Protected routes
router.use(authMiddleware);

// Dashboard stats
router.get('/stats', (_req: AuthRequest, res: Response) => {
  const stats: AdminStats = {
    activeRooms: roomModel.getActiveRoomsCount(),
    totalGames: gameModel.getTotalGames(),
    totalQuestions: questionModel.getTotalQuestions(),
    questionsByType: questionModel.getQuestionStats()
  };
  res.json(stats);
});

// Questions CRUD
router.get('/questions', (_req: AuthRequest, res: Response) => {
  const questions = questionModel.getAllQuestions();
  res.json(questions);
});

router.get('/questions/:id', (req: AuthRequest, res: Response) => {
  const question = questionModel.getQuestionById(parseInt(req.params.id, 10));
  if (!question) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }
  res.json(question);
});

router.post('/questions', (req: AuthRequest, res: Response) => {
  const { type, category, text, options, timer } = req.body;

  if (!type || !category || !text) {
    res.status(400).json({ error: 'Type, category, and text are required' });
    return;
  }

  const question = questionModel.createQuestion({
    type,
    category,
    text,
    options,
    timer: timer || 20
  });

  res.status(201).json(question);
});

router.put('/questions/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const question = questionModel.updateQuestion(id, req.body);

  if (!question) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }

  res.json(question);
});

router.delete('/questions/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const deleted = questionModel.deleteQuestion(id);

  if (!deleted) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }

  res.status(204).send();
});

// Import/Export questions
router.post('/questions/import', (req: AuthRequest, res: Response) => {
  try {
    const data = req.body as QuestionImport;

    if (!data.questions || !Array.isArray(data.questions)) {
      res.status(400).json({ error: 'Invalid import format' });
      return;
    }

    const imported = questionModel.importQuestions(data);
    res.json({ imported });
  } catch (error) {
    res.status(500).json({ error: 'Import failed' });
  }
});

router.get('/questions/export/all', (_req: AuthRequest, res: Response) => {
  const data = questionModel.exportQuestions();
  res.json(data);
});

// Rooms management
router.get('/rooms', (_req: AuthRequest, res: Response) => {
  const rooms = roomModel.getAllRooms();
  res.json(rooms);
});

router.delete('/rooms/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  roomModel.deleteRoom(id);
  res.status(204).send();
});

export default router;
