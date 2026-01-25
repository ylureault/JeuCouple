import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';

export default function LobbyChat() {
  const { chatMessages, sendChatMessage, playerId, room } = useGame();
  const { playSound } = useAudio();
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && isExpanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isExpanded]);

  // Play sound on new message from other player
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage.playerId !== playerId) {
        playSound('click');
      }
    }
  }, [chatMessages.length, playerId, playSound]);

  const handleSend = () => {
    if (message.trim()) {
      sendChatMessage(message);
      setMessage('');
      playSound('click');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getPlayerColor = (msgPlayerId: 1 | 2) => {
    const gender = msgPlayerId === 1 ? room?.player1_gender : room?.player2_gender;
    return gender === 'F' ? 'bg-pink-500' : 'bg-blue-500';
  };

  const unreadCount = isExpanded ? 0 : chatMessages.filter(m => m.playerId !== playerId).length;

  return (
    <div className="relative">
      {/* Toggle button */}
      <motion.button
        onClick={() => {
          setIsExpanded(!isExpanded);
          if (!isExpanded) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2 rounded-full transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span>💬</span>
        <span className="text-sm">Chat</span>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-2 right-0 w-72 bg-black/80 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <span className="text-white font-semibold text-sm">💬 Chat</span>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-white/60 hover:text-white text-lg"
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div className="h-48 overflow-y-auto p-2 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-white/40 text-center text-sm py-8">
                  Envoie un message à ton partenaire !
                </p>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.playerId === playerId;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-1.5 ${
                          isMe
                            ? 'bg-purple-600 text-white'
                            : `${getPlayerColor(msg.playerId)} text-white`
                        }`}
                      >
                        {!isMe && (
                          <p className="text-xs text-white/70 font-semibold mb-0.5">
                            {msg.playerName}
                          </p>
                        )}
                        <p className="text-sm break-words">{msg.message}</p>
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-2 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                  onKeyDown={handleKeyDown}
                  placeholder="Ton message..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-purple-500"
                />
                <motion.button
                  onClick={handleSend}
                  disabled={!message.trim()}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-white/10 disabled:text-white/30 text-white px-3 py-2 rounded-lg transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  ➤
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
