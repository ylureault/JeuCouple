import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Question, AdminStats, QuestionType, QuestionTypeConfig, Category } from '../../../shared/types';
import CategoryBadge from '../components/CategoryBadge';

type Tab = 'dashboard' | 'questions' | 'types' | 'categories' | 'rooms';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rooms, setRooms] = useState<{ id: number; code: string; player1_name: string | null; player2_name: string | null; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingType, setEditingType] = useState<QuestionTypeConfig | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('adminToken');

  const fetchData = useCallback(async () => {
    if (!token) {
      navigate('/admin/login');
      return;
    }

    try {
      const [statsRes, questionsRes, typesRes, categoriesRes, roomsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/questions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/question-types', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/rooms', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (statsRes.status === 401 || questionsRes.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
        return;
      }

      setStats(await statsRes.json());
      setQuestions(await questionsRes.json());
      setQuestionTypes(await typesRes.json());
      setCategories(await categoriesRes.json());
      setRooms(await roomsRes.json());
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('Supprimer cette question ?')) return;

    await fetch(`/api/admin/questions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleDeleteRoom = async (id: number) => {
    if (!confirm('Supprimer ce salon ?')) return;

    await fetch(`/api/admin/rooms/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    setRooms((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveQuestion = async (question: Partial<Question>) => {
    const method = editingQuestion ? 'PUT' : 'POST';
    const url = editingQuestion
      ? `/api/admin/questions/${editingQuestion.id}`
      : '/api/admin/questions';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(question)
    });

    if (response.ok) {
      fetchData();
      setShowQuestionModal(false);
      setEditingQuestion(null);
    }
  };

  const handleImport = async () => {
    try {
      const data = JSON.parse(importJson);
      const response = await fetch('/api/admin/questions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`${result.imported} questions importees`);
        fetchData();
        setShowImportModal(false);
        setImportJson('');
      }
    } catch {
      alert('JSON invalide');
    }
  };

  const handleExport = async () => {
    const response = await fetch('/api/admin/questions/export/all', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions.json';
    a.click();
  };

  // Type handlers
  const handleSaveType = async (typeData: Partial<QuestionTypeConfig>) => {
    const method = editingType ? 'PUT' : 'POST';
    const url = editingType
      ? `/api/admin/question-types/${editingType.id}`
      : '/api/admin/question-types';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(typeData)
    });

    if (response.ok) {
      fetchData();
      setShowTypeModal(false);
      setEditingType(null);
    }
  };

  const handleDeleteType = async (id: number) => {
    if (!confirm('Supprimer ce type de question ?')) return;

    await fetch(`/api/admin/question-types/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    setQuestionTypes((prev) => prev.filter((t) => t.id !== id));
  };

  // Category handlers
  const handleSaveCategory = async (categoryData: Partial<Category>) => {
    const method = editingCategory ? 'PUT' : 'POST';
    const url = editingCategory
      ? `/api/admin/categories/${editingCategory.id}`
      : '/api/admin/categories';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(categoryData)
    });

    if (response.ok) {
      fetchData();
      setShowCategoryModal(false);
      setEditingCategory(null);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Supprimer cette categorie ?')) return;

    await fetch(`/api/admin/categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-display font-bold">Administration</h1>
        <button onClick={handleLogout} className="text-white/50 hover:text-white">
          Deconnexion
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {(['dashboard', 'questions', 'types', 'categories', 'rooms'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
              tab === t
                ? 'bg-primary text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {t === 'dashboard' && '📊 Tableau de bord'}
            {t === 'questions' && '❓ Questions'}
            {t === 'types' && '🏷️ Types'}
            {t === 'categories' && '📁 Catégories'}
            {t === 'rooms' && '🏠 Salons'}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatCard title="Salons actifs" value={stats.activeRooms} />
          <StatCard title="Parties jouees" value={stats.totalGames} />
          <StatCard title="Questions" value={stats.totalQuestions} />
          <StatCard title="Type A" value={stats.questionsByType.A} />
          <StatCard title="Type B" value={stats.questionsByType.B} />
          <StatCard title="Type C" value={stats.questionsByType.C} />
          <StatCard title="Type D" value={stats.questionsByType.D} />
        </motion.div>
      )}

      {/* Questions */}
      {tab === 'questions' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => {
                setEditingQuestion(null);
                setShowQuestionModal(true);
              }}
              className="btn-primary text-sm py-2 px-4"
            >
              + Nouvelle question
            </button>
            <button onClick={() => setShowImportModal(true)} className="btn-secondary text-sm py-2 px-4">
              Importer JSON
            </button>
            <button onClick={handleExport} className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl text-sm">
              Exporter JSON
            </button>
          </div>

          <div className="space-y-2">
            {questions.map((q) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="card flex items-center gap-4"
              >
                <span className="bg-primary/20 text-primary px-2 py-1 rounded font-mono text-sm">
                  {q.type}
                </span>
                <CategoryBadge category={q.category} />
                <span className="flex-1 truncate">{q.text}</span>
                <span className="text-white/50 text-sm">{q.timer}s</span>
                <button
                  onClick={() => {
                    setEditingQuestion(q);
                    setShowQuestionModal(true);
                  }}
                  className="text-primary hover:text-primary-light"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDeleteQuestion(q.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Supprimer
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Types */}
      {tab === 'types' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setEditingType(null);
                setShowTypeModal(true);
              }}
              className="btn-primary text-sm py-2 px-4"
            >
              + Nouveau type
            </button>
          </div>

          <div className="space-y-2">
            {questionTypes.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="card flex items-center gap-4"
              >
                <span className="bg-primary/20 text-primary px-3 py-1 rounded font-mono text-lg font-bold">
                  {t.code}
                </span>
                <div className="flex-1">
                  <p className="font-bold">{t.name}</p>
                  <p className="text-white/50 text-sm">{t.description}</p>
                </div>
                <span className={`px-2 py-1 rounded text-sm ${
                  t.scoring_mode === 'match' ? 'bg-green-500/20 text-green-400' :
                  t.scoring_mode === 'consensus' ? 'bg-blue-500/20 text-blue-400' :
                  t.scoring_mode === 'proximity' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-white/20 text-white/50'
                }`}>
                  {t.scoring_mode}
                </span>
                <span className="text-white/50 text-sm">{t.input_type}</span>
                <span className={`w-3 h-3 rounded-full ${t.active ? 'bg-green-500' : 'bg-red-500'}`} />
                <button
                  onClick={() => {
                    setEditingType(t);
                    setShowTypeModal(true);
                  }}
                  className="text-primary hover:text-primary-light"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDeleteType(t.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Supprimer
                </button>
              </motion.div>
            ))}
            {questionTypes.length === 0 && (
              <p className="text-white/50 text-center py-8">Aucun type de question</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Categories */}
      {tab === 'categories' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
              className="btn-primary text-sm py-2 px-4"
            >
              + Nouvelle catégorie
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="card relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-10"
                  style={{ backgroundColor: c.color }}
                />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{c.icon}</span>
                    <div>
                      <p className="font-bold text-lg">{c.name}</p>
                      <p className="text-white/50 text-sm font-mono">{c.code}</p>
                    </div>
                    <span className={`ml-auto w-3 h-3 rounded-full ${c.active ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                  {c.description && (
                    <p className="text-white/60 text-sm mb-3">{c.description}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingCategory(c);
                        setShowCategoryModal(true);
                      }}
                      className="text-primary hover:text-primary-light text-sm"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(c.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            {categories.length === 0 && (
              <p className="text-white/50 text-center py-8 col-span-full">Aucune catégorie</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Rooms */}
      {tab === 'rooms' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="space-y-2">
            {rooms.map((r) => (
              <div key={r.id} className="card flex items-center gap-4">
                <span className="font-mono font-bold text-primary">{r.code}</span>
                <span className="flex-1">
                  {r.player1_name || '?'} vs {r.player2_name || '?'}
                </span>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    r.status === 'playing'
                      ? 'bg-green-500/20 text-green-400'
                      : r.status === 'waiting'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-white/20 text-white/50'
                  }`}
                >
                  {r.status}
                </span>
                <button
                  onClick={() => handleDeleteRoom(r.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Supprimer
                </button>
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-white/50 text-center py-8">Aucun salon</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Question Modal */}
      <AnimatePresence>
        {showQuestionModal && (
          <QuestionModal
            question={editingQuestion}
            onSave={handleSaveQuestion}
            onClose={() => {
              setShowQuestionModal(false);
              setEditingQuestion(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowImportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-4">Importer des questions</h2>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="input-field h-48 font-mono text-sm"
                placeholder='{"questions": [...]}'
              />
              <div className="flex gap-2 mt-4">
                <button onClick={handleImport} className="btn-primary flex-1">
                  Importer
                </button>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl flex-1"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Type Modal */}
      <AnimatePresence>
        {showTypeModal && (
          <TypeModal
            questionType={editingType}
            onSave={handleSaveType}
            onClose={() => {
              setShowTypeModal(false);
              setEditingType(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Category Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <CategoryModal
            category={editingCategory}
            onSave={handleSaveCategory}
            onClose={() => {
              setShowCategoryModal(false);
              setEditingCategory(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-bold text-primary">{value}</p>
      <p className="text-white/50 text-sm">{title}</p>
    </div>
  );
}

interface QuestionModalProps {
  question: Question | null;
  onSave: (q: Partial<Question>) => void;
  onClose: () => void;
}

function QuestionModal({ question, onSave, onClose }: QuestionModalProps) {
  const [type, setType] = useState<QuestionType>(question?.type || 'A');
  const [category, setCategory] = useState(question?.category || 'couple');
  const [text, setText] = useState(question?.text || '');
  const [options, setOptions] = useState<string[]>(question?.options || ['', '', '', '']);
  const [optionA, setOptionA] = useState(question?.option_a || '');
  const [optionB, setOptionB] = useState(question?.option_b || '');
  const [timer, setTimer] = useState(question?.timer || 20);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Partial<Question> = {
      type,
      category,
      text,
      timer
    };

    if (type === 'A' || type === 'B') {
      data.options = options.filter(Boolean);
    }
    if (type === 'E') {
      data.option_a = optionA;
      data.option_b = optionB;
    }

    onSave(data);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">
          {question ? 'Modifier la question' : 'Nouvelle question'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
                className="input-field"
              >
                <option value="A">A - Devine l'autre</option>
                <option value="B">B - Reponses identiques</option>
                <option value="C">C - Reponse libre</option>
                <option value="D">D - Echelle</option>
                <option value="E">E - Tu es plutot...</option>
                <option value="F">F - Qui de nous deux</option>
              </select>
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Categorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
              >
                <option value="couple">Couple</option>
                <option value="preferences">Préférences</option>
                <option value="habitudes">Habitudes</option>
                <option value="souvenirs">Souvenirs</option>
                <option value="projets">Projets</option>
                <option value="sexy">Sexy</option>
                <option value="coquin">Coquin</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">Question</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="input-field h-24"
              required
            />
          </div>

          {/* Options for type A and B */}
          {(type === 'A' || type === 'B') && (
            <div>
              <label className="block text-white/70 text-sm mb-2">Options (4 max)</label>
              {options.map((opt, i) => (
                <input
                  key={i}
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...options];
                    newOpts[i] = e.target.value;
                    setOptions(newOpts);
                  }}
                  className="input-field mb-2"
                  placeholder={`Option ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Binary options for type E */}
          {type === 'E' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/70 text-sm mb-2">Option A</label>
                <input
                  type="text"
                  value={optionA}
                  onChange={(e) => setOptionA(e.target.value)}
                  className="input-field"
                  placeholder="Ex: Mer"
                  required
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Option B</label>
                <input
                  type="text"
                  value={optionB}
                  onChange={(e) => setOptionB(e.target.value)}
                  className="input-field"
                  placeholder="Ex: Montagne"
                  required
                />
              </div>
            </div>
          )}

          {/* Info for type F */}
          {type === 'F' && (
            <div className="bg-white/10 rounded-lg p-4 text-sm text-white/70">
              <p>💡 Pour ce type, les joueurs choisissent entre "Moi" et "Lui/Elle".</p>
              <p className="mt-1">Aucune option supplémentaire n'est nécessaire.</p>
            </div>
          )}

          {/* Info for type C */}
          {type === 'C' && (
            <div className="bg-white/10 rounded-lg p-4 text-sm text-white/70">
              <p>💬 Question à réponse libre - les joueurs écrivent leur propre réponse.</p>
            </div>
          )}

          {/* Info for type D */}
          {type === 'D' && (
            <div className="bg-white/10 rounded-lg p-4 text-sm text-white/70">
              <p>📊 Question à échelle - les joueurs choisissent une valeur de 1 à 10.</p>
            </div>
          )}

          <div>
            <label className="block text-white/70 text-sm mb-2">Timer (secondes)</label>
            <input
              type="number"
              value={timer}
              onChange={(e) => setTimer(parseInt(e.target.value) || 20)}
              className="input-field"
              min={10}
              max={120}
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              Enregistrer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl flex-1"
            >
              Annuler
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Type Modal
interface TypeModalProps {
  questionType: QuestionTypeConfig | null;
  onSave: (t: Partial<QuestionTypeConfig>) => void;
  onClose: () => void;
}

function TypeModal({ questionType, onSave, onClose }: TypeModalProps) {
  const [code, setCode] = useState(questionType?.code || '');
  const [name, setName] = useState(questionType?.name || '');
  const [description, setDescription] = useState(questionType?.description || '');
  const [scoringMode, setScoringMode] = useState<'match' | 'consensus' | 'proximity' | 'none' | 'individual'>(questionType?.scoring_mode || 'match');
  const [inputType, setInputType] = useState<'options' | 'binary' | 'scale' | 'text' | 'who' | 'qcm' | 'image_choice'>(questionType?.input_type || 'options');
  const [icon, setIcon] = useState(questionType?.icon || '❓');
  const [color, setColor] = useState(questionType?.color || '#46178f');
  const [active, setActive] = useState(questionType?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      code,
      name,
      description,
      scoring_mode: scoringMode,
      input_type: inputType,
      icon,
      color,
      active
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">
          {questionType ? 'Modifier le type' : 'Nouveau type de question'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Code (ex: G)</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="input-field font-mono"
                maxLength={2}
                required
                disabled={!!questionType}
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Mode de scoring</label>
              <select
                value={scoringMode}
                onChange={(e) => setScoringMode(e.target.value as 'match' | 'consensus' | 'proximity' | 'none' | 'individual')}
                className="input-field"
              >
                <option value="match">Match (réponses identiques)</option>
                <option value="consensus">Consensus (accord)</option>
                <option value="proximity">Proximité (écart)</option>
                <option value="none">Aucun (découverte)</option>
                <option value="individual">Individuel (chacun pour soi)</option>
              </select>
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Type d'input</label>
              <select
                value={inputType}
                onChange={(e) => setInputType(e.target.value as 'options' | 'binary' | 'scale' | 'text' | 'who' | 'qcm')}
                className="input-field"
              >
                <option value="options">Options (choix multiple)</option>
                <option value="binary">Binaire (A ou B)</option>
                <option value="scale">Échelle (1-10)</option>
                <option value="text">Texte libre</option>
                <option value="who">Qui (Moi/Lui-Elle)</option>
                <option value="qcm">QCM (bonne réponse)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Icône</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="input-field text-center text-2xl"
                placeholder="❓"
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Couleur</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="input-field flex-1 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="type-active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-5 h-5 rounded"
            />
            <label htmlFor="type-active" className="text-white/70">Actif</label>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              Enregistrer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl flex-1"
            >
              Annuler
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Category Modal
interface CategoryModalProps {
  category: Category | null;
  onSave: (c: Partial<Category>) => void;
  onClose: () => void;
}

function CategoryModal({ category, onSave, onClose }: CategoryModalProps) {
  const [code, setCode] = useState(category?.code || '');
  const [name, setName] = useState(category?.name || '');
  const [icon, setIcon] = useState(category?.icon || '💬');
  const [color, setColor] = useState(category?.color || '#46178f');
  const [description, setDescription] = useState(category?.description || '');
  const [sortOrder, setSortOrder] = useState(category?.sort_order || 0);
  const [active, setActive] = useState(category?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      code,
      name,
      icon,
      color,
      description,
      sort_order: sortOrder,
      active
    });
  };

  const emojis = ['💕', '❤️', '💬', '🎯', '🌟', '🔥', '😈', '🎪', '📍', '✨', '🎉', '🤔', '😊', '👫', '💑', '🏠'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">
          {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase())}
                className="input-field font-mono"
                required
                disabled={!!category}
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">Icône</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`text-2xl p-2 rounded-lg transition-all ${
                    icon === emoji ? 'bg-primary scale-110' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="input-field"
              placeholder="Ou entrez un emoji personnalisé"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">Couleur</label>
            <div className="flex gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-12 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="input-field flex-1 font-mono"
                placeholder="#46178f"
              />
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Ordre d'affichage</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                className="input-field"
                min={0}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="cat-active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <label htmlFor="cat-active" className="text-white/70">Actif</label>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              Enregistrer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl flex-1"
            >
              Annuler
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
