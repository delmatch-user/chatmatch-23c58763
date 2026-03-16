import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

const Index = () => {
  const navigate = useNavigate();
  const { user } = useApp();

  useEffect(() => {
    if (user) {
      navigate('/fila');
    } else {
      navigate('/login');
    }
  }, [user, navigate]);

  return null;
};

export default Index;
