import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import AuthCard from '../shared/AuthCard';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reEnterPassword, setReEnterPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // basic client-side validations mirroring backend
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }
    if (password !== reEnterPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/signup', { name, email, password, reEnterPassword });
      if (data?.success) {
        setSuccess('Account created successfully');
        setTimeout(() => navigate('/login'), 1200);
      } else {
        setError(data?.message || 'Signup failed');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const cardClass = error ? 'animate-shake' : success ? 'animate-success' : '';
  return (
    <AuthCard title="Sign up page" className={cardClass}>
      <form onSubmit={onSubmit} className="form">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />

        <label>Email id</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <label>Re-enter password</label>
        <input type="password" value={reEnterPassword} onChange={(e) => setReEnterPassword(e.target.value)} required />

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        <button type="submit" disabled={loading} className="primary">
          {loading && <span className="spinner" />} {loading ? 'Signing up…' : 'Sign Up'}
        </button>
        <div className="muted">
          <Link to="/login">Back to Sign In</Link>
        </div>
      </form>
    </AuthCard>
  );
}
