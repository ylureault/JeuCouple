import { Router, Response } from 'express';
import { authMiddleware, generateToken, AuthRequest } from '../middleware/auth.js';
import * as adminModel from '../models/admin.js';
import * as questionModel from '../models/question.js';
import * as roomModel from '../models/room.js';
import * as gameModel from '../models/game.js';
import * as questionTypeModel from '../models/questionType.js';
import * as categoryModel from '../models/category.js';
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

// ==========================================
// Question Types CRUD
// ==========================================

router.get('/question-types', (_req: AuthRequest, res: Response) => {
  const types = questionTypeModel.getAllQuestionTypes();
  res.json(types);
});

router.get('/question-types/active', (_req: AuthRequest, res: Response) => {
  const types = questionTypeModel.getActiveQuestionTypes();
  res.json(types);
});

router.get('/question-types/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const type = questionTypeModel.getQuestionTypeById(id);
  if (!type) {
    res.status(404).json({ error: 'Question type not found' });
    return;
  }
  res.json(type);
});

router.post('/question-types', (req: AuthRequest, res: Response) => {
  const { code, name, description, scoring_mode, input_type, icon, color } = req.body;

  if (!code || !name || !scoring_mode || !input_type) {
    res.status(400).json({ error: 'code, name, scoring_mode, and input_type are required' });
    return;
  }

  try {
    const type = questionTypeModel.createQuestionType({
      code,
      name,
      description: description || '',
      scoring_mode,
      input_type,
      icon: icon || '',
      color: color || '#666666'
    });
    res.status(201).json(type);
  } catch (error) {
    res.status(400).json({ error: 'Code already exists' });
  }
});

router.put('/question-types/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const type = questionTypeModel.updateQuestionType(id, req.body);

  if (!type) {
    res.status(404).json({ error: 'Question type not found' });
    return;
  }

  res.json(type);
});

router.delete('/question-types/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const deleted = questionTypeModel.deleteQuestionType(id);

  if (!deleted) {
    res.status(404).json({ error: 'Question type not found' });
    return;
  }

  res.status(204).send();
});

// ==========================================
// Categories CRUD
// ==========================================

router.get('/categories', (_req: AuthRequest, res: Response) => {
  const categories = categoryModel.getAllCategories();
  res.json(categories);
});

router.get('/categories/active', (_req: AuthRequest, res: Response) => {
  const categories = categoryModel.getActiveCategories();
  res.json(categories);
});

router.get('/categories/stats', (_req: AuthRequest, res: Response) => {
  const stats = categoryModel.getCategoryStats();
  res.json(stats);
});

router.get('/categories/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const category = categoryModel.getCategoryById(id);
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  res.json(category);
});

router.post('/categories', (req: AuthRequest, res: Response) => {
  const { code, name, icon, color, description, sort_order } = req.body;

  if (!code || !name) {
    res.status(400).json({ error: 'code and name are required' });
    return;
  }

  try {
    const category = categoryModel.createCategory({
      code,
      name,
      icon: icon || '',
      color: color || '#666666',
      description: description || '',
      sort_order: sort_order || 0
    });
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ error: 'Code already exists' });
  }
});

router.put('/categories/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const category = categoryModel.updateCategory(id, req.body);

  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  res.json(category);
});

router.delete('/categories/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const deleted = categoryModel.deleteCategory(id);

  if (!deleted) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  res.status(204).send();
});

// ==========================================
// Sample JSON for import
// ==========================================

router.get('/questions/sample-json', (_req: AuthRequest, res: Response) => {
  const sampleJson = {
    questions: [
      {
        type: 'A',
        category: 'couple',
        text: "Quel est le plat prefere de ton/ta partenaire?",
        options: ["Pizza", "Sushi", "Burger", "Salade"],
        timer: 20
      },
      {
        type: 'B',
        category: 'preferences',
        text: "Quelle est votre serie preferee en commun?",
        options: ["Netflix Original", "HBO", "Disney+", "Autre"],
        timer: 20
      },
      {
        type: 'C',
        category: 'souvenirs',
        text: "Decris votre premier baiser en un mot",
        timer: 30
      },
      {
        type: 'D',
        category: 'couple',
        text: "Sur une echelle de 1 a 10, a quel point es-tu romantique?",
        timer: 15
      },
      {
        type: 'E',
        category: 'preferences',
        text: "Tu es plutot...",
        option_a: "Matin calme",
        option_b: "Nuit animee",
        timer: 15
      },
      {
        type: 'F',
        category: 'couple',
        text: "Qui de vous deux est le plus jaloux?",
        timer: 15
      }
    ]
  };
  res.json(sampleJson);
});

export default router;
