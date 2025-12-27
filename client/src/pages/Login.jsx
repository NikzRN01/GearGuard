import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import AuthCard from '../shared/AuthCard';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data?.success) {
        // store minimal user session for demo
        sessionStorage.setItem('user', JSON.stringify(data.user));
        navigate('/app');
      } else {
        setError(data?.message || 'Login failed');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const cardClass = error ? 'animate-shake' : '';
  return (
    <AuthCard title="Login Page" className={cardClass}>
      <form onSubmit={onSubmit} className="form">
        <label>Email id</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading} className="primary">
          {loading && <span className="spinner" />} {loading ? 'Signing in…' : 'Sign In'}
        </button>
        <div className="muted">
          <Link to="/signup">Sign up</Link> · <a href="#" onClick={(e)=>e.preventDefault()}>Forgot Password?</a>
        </div>
      </form>
    </AuthCard>
  );
}
