import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Question, AdminStats, QuestionType } from '../../../shared/types';
import CategoryBadge from '../components/CategoryBadge';

type Tab = 'dashboard' | 'questions' | 'rooms';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rooms, setRooms] = useState<{ id: number; code: string; player1_name: string | null; player2_name: string | null; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
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
      const [statsRes, questionsRes, roomsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/questions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/rooms', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (statsRes.status === 401 || questionsRes.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
        return;
      }

      setStats(await statsRes.json());
      setQuestions(await questionsRes.json());
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
      <div className="flex gap-2 mb-8 overflow-x-auto">
        {(['dashboard', 'questions', 'rooms'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl font-medium transition-all ${
              tab === t
                ? 'bg-primary text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {t === 'dashboard' && 'Tableau de bord'}
            {t === 'questions' && 'Questions'}
            {t === 'rooms' && 'Salons'}
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
  const [timer, setTimer] = useState(question?.timer || 20);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      type,
      category,
      text,
      options: type === 'A' || type === 'B' ? options.filter(Boolean) : undefined,
      timer
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
                <option value="B">B - Qui de nous deux</option>
                <option value="C">C - Reponse libre</option>
                <option value="D">D - Echelle</option>
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
                <option value="sexy">Sexy</option>
                <option value="coquin">Coquin</option>
                <option value="habitudes">Habitudes</option>
                <option value="souvenirs">Souvenirs</option>
                <option value="projets">Projets</option>
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

          {(type === 'A' || type === 'B') && (
            <div>
              <label className="block text-white/70 text-sm mb-2">Options</label>
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
