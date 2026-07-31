import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import AuthCard from '../shared/AuthCard';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Both parts of the emailed link are required: the token is what proves the
  // request came from the account owner.
  useEffect(() => {
    const emailParam = searchParams.get('email');
    const tokenParam = searchParams.get('token');
    setEmail(emailParam || '');
    setToken(tokenParam || '');
    if (!emailParam || !tokenParam) {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [searchParams]);

  const linkIsValid = Boolean(email && token);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!linkIsValid) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/auth/reset-password', {
        email,
        token,
        newPassword,
        confirmPassword
      });

      if (data?.success) {
        setSuccess('Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setError(data?.message || 'Failed to reset password');
      }
    } catch (err) {
      if (err?.code === 'ERR_NETWORK') {
        setError('Unable to connect to server. Please check your connection.');
      } else if (err?.response?.status === 404) {
        setError('Account not found. Please check your email address.');
      } else if (err?.response?.status === 400) {
        setError(err?.response?.data?.message || 'Invalid input. Please check your passwords.');
      } else {
        setError(err?.response?.data?.message || 'Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const cardClass = error ? 'animate-shake' : '';

  return (
    <AuthCard 
      title="Reset Your Password" 
      subtitle="Enter your new password below"
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
            disabled
            required
            style={{ backgroundColor: 'var(--gg-color-surface-subtle)', cursor: 'not-allowed' }}
          />
        </div>

        <div className="input-group">
          <label htmlFor="newPassword">New Password</label>
          <div className="password-input">
            <input 
              id="newPassword"
              type={showPassword ? "text" : "password"}
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              placeholder="Enter new password"
              required 
              disabled={loading || !linkIsValid}
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

        <div className="input-group">
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <div className="password-input">
            <input 
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              placeholder="Re-enter new password"
              required 
              disabled={loading || !linkIsValid}
            />
            <button 
              type="button" 
              className="password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? (
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

        <div className="password-requirements" style={{ fontSize: 'var(--gg-text-xs)', color: 'var(--gg-color-text-muted)', marginTop: '-10px', marginBottom: '15px' }}>
          <p style={{ margin: '5px 0' }}>Password must contain:</p>
          <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
            <li>At least 8 characters</li>
            <li>One uppercase letter</li>
            <li>One lowercase letter</li>
            <li>One special character (!@#$%^&*)</li>
          </ul>
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="alert">{success}</div>}

        <button type="submit" disabled={loading || !linkIsValid} className="btn-primary">
          {loading ? (
            <><span className="spinner" /> Resetting Password...</>
          ) : (
            'Reset Password'
          )}
        </button>
      </form>
    </AuthCard>
  );
}