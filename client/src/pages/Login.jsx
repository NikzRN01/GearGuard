import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import AuthCard from '../shared/AuthCard';
import { getDefaultAppPath } from '../services/session';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Input from '../components/ui/Input';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        navigate(getDefaultAppPath(data.user));
      } else {
        setError(data?.message || 'Login failed');
      }
    } catch (err) {
      if (err?.code === 'ERR_NETWORK') {
        setError('Unable to connect to server. Please check your connection.');
      } else if (err?.response?.status === 401) {
        // The API deliberately does not distinguish an unknown account from a
        // wrong password, so neither does this message.
        setError('Invalid email or password. Please try again.');
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
        // The API answers identically whether or not the address is registered,
        // so this confirmation must stay non-committal too.
        setForgotSuccess('If an account exists for that address, a reset link is on its way.');
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
      } else {
        setForgotError(err?.response?.data?.message || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <>
      <AuthCard 
        title="Welcome back" 
        subtitle="Sign in to review equipment, requests, schedules, and assigned work."
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

        {error && <Alert tone="danger" title="Sign in failed">{error}</Alert>}

        <div className="form-footer">
          <button 
            type="button" 
            className="link-btn" 
            onClick={() => setShowForgotPassword(true)}
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" pending={loading} pendingLabel="Signing in...">Sign in</Button>
        </form>
      </AuthCard>

      {showForgotPassword && (
        <div className="modal-overlay auth-dialog-overlay" onClick={() => {
          setShowForgotPassword(false);
          setForgotEmail('');
          setForgotError('');
          setForgotSuccess('');
        }}>
          <div className="modal-content auth-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="reset-password-title">Reset password</h3>
            <p>Enter your email address and we'll send you a link to reset your password.</p>
            
            <form onSubmit={handleForgotPassword}>
              <Field label="Account email" required><Input
                type="email"
                placeholder="you@company.com"
                className="modal-input"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                disabled={forgotLoading}
                autoComplete="email"
              /></Field>
              
              {forgotError && <Alert tone="danger">{forgotError}</Alert>}
              {forgotSuccess && <Alert tone="success">{forgotSuccess}</Alert>}
              
              <div className="modal-actions">
                <Button 
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotEmail('');
                    setForgotError('');
                    setForgotSuccess('');
                  }}
                  disabled={forgotLoading}
                >Cancel</Button>
                <Button 
                  type="submit" 
                  pending={forgotLoading}
                  pendingLabel="Sending..."
                  disabled={!forgotEmail}
                >Send reset link</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
