import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import AuthCard from '../shared/AuthCard';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

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
      if (err?.code === 'ERR_NETWORK') {
        setError('Unable to connect to server. Please check your connection.');
      } else if (err?.response?.status === 401) {
        setError('Invalid email or password. Please try again.');
      } else if (err?.response?.status === 404) {
        setError('Account not found. Please sign up first.');
      } else {
        setError(err?.response?.data?.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);
    
    try {
      const { data } = await api.post('/auth/forget-password', { email: forgotEmail });
      if (data?.success) {
        setForgotSuccess('Password reset email sent! Please check your inbox.');
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotEmail('');
          setForgotSuccess('');
        }, 3000);
      } else {
        setForgotError(data?.message || 'Failed to send reset email');
      }
    } catch (err) {
      if (err?.code === 'ERR_NETWORK') {
        setForgotError('Unable to connect to server. Please check your connection.');
      } else if (err?.response?.status === 404) {
        setForgotError('No account found with this email address.');
      } else {
        setForgotError(err?.response?.data?.message || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const cardClass = error ? 'animate-shake' : '';

  return (
    <>
      <AuthCard 
        title="Welcome Back" 
        subtitle="Sign in to manage equipment and track maintenance"
        className={cardClass}
      >
        <form onSubmit={onSubmit} className="auth-form">
        <div className="input-group">
          <label htmlFor="email">Email Address</label>
          <input 
            id="email"
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="you@company.com"
            autoComplete="email"
            required 
          />
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <div className="password-input">
            <input 
              id="password"
              type={showPassword ? "text" : "password"}
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Enter your password"
              autoComplete="current-password"
              required 
            />
            <button 
              type="button" 
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                  <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7Z"/>
                  <circle cx="10" cy="10" r="3"/>
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                  <path d="M3.98 8.223A10.477 10.477 0 0 0 1 10c.73 2.89 4 7 9 7 1.59 0 3.07-.44 4.38-1.21M6.66 6.61A8.885 8.885 0 0 1 10 6c5 0 8.27 4.11 9 7a11.5 11.5 0 0 1-1.02 1.74M13.34 13.39A3 3 0 1 1 6.66 6.61"/>
                  <line x1="1" y1="1" x2="19" y2="19"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <div className="form-footer">
          <label className="checkbox">
            <input 
              type="checkbox" 
              checked={remember} 
              onChange={(e) => setRemember(e.target.checked)} 
            />
            Remember me
          </label>
          <button 
            type="button" 
            className="link-btn" 
            onClick={() => setShowForgotPassword(true)}
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <><span className="spinner" /> Signing in...</>
          ) : (
            'Sign In'
          )}
        </button>
        </form>
      </AuthCard>

      {showForgotPassword && (
        <div className="modal-overlay" onClick={() => {
          setShowForgotPassword(false);
          setForgotEmail('');
          setForgotError('');
          setForgotSuccess('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Password</h3>
            <p>Enter your email address and we'll send you a link to reset your password.</p>
            
            <form onSubmit={handleForgotPassword}>
              <input 
                type="email" 
                placeholder="you@company.com" 
                className="modal-input" 
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                disabled={forgotLoading}
              />
              
              {forgotError && <div className="alert alert-error" style={{marginTop: '10px'}}>{forgotError}</div>}
              {forgotSuccess && <div className="alert alert-success" style={{marginTop: '10px'}}>{forgotSuccess}</div>}
              
              <div className="modal-actions">
                <button 
                  type="button"
                  className="btn-secondary" 
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotEmail('');
                    setForgotError('');
                    setForgotSuccess('');
                  }}
                  disabled={forgotLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-accent"
                  disabled={forgotLoading || !forgotEmail}
                >
                  {forgotLoading ? (
                    <><span className="spinner" /> Sending...</>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
