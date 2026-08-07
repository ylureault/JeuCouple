import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Simple redirect component that passes the room code to home
export default function Join() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (code) {
      // Navigate to home with the code in state
      navigate('/', { state: { joinCode: code.toUpperCase() } });
    } else {
      navigate('/');
    }
  }, [code, navigate]);

  return (
    <div className="min-h-[100dvh] bg-[#180512] flex items-center justify-center">
      <div className="text-white text-xl font-bold">Redirection...</div>
    </div>
  );
}
