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

function App() {
  return (
    <ThemeProvider>
      <AudioProvider>
        <GameProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/salon/:code" element={<Lobby />} />
            <Route path="/game" element={<Game />} />
            <Route path="/results" element={<Results />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </GameProvider>
      </AudioProvider>
    </ThemeProvider>
  );
}

export default App;
