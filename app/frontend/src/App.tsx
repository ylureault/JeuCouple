import { Routes, Route } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import { AudioProvider } from './context/AudioContext';
import { ThemeProvider } from './context/ThemeContext';
import Home from './pages/Home';
import Join from './pages/Join';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Results from './pages/Results';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
// Bandeau global : une perte de socket doit se VOIR, sur n'importe quel ecran.
import ConnectionBanner from './components/ConnectionBanner';

function App() {
  return (
    <ThemeProvider>
      <AudioProvider>
        <GameProvider>
          <ConnectionBanner />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/salon/:code" element={<Lobby />} />
            <Route path="/game/:code" element={<Game />} />
            <Route path="/results/:code" element={<Results />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </GameProvider>
      </AudioProvider>
    </ThemeProvider>
  );
}

export default App;
