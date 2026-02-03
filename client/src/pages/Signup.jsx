import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import AuthCard from '../shared/AuthCard';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState('user');
  const [password, setPassword] = useState('');
  const [reEnterPassword, setReEnterPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(null);

  const passwordStrength = useMemo(() => {
    if (!password) return { label: '', score: 0, color: '' };
    const checks = [/[A-Z]/, /[a-z]/, /\d/, /[^\w]/];
    const score = checks.reduce((acc, regex) => acc + (regex.test(password) ? 1 : 0), 0) + (password.length >= 10 ? 1 : 0);
    if (score >= 4) return { label: 'Strong', score, color: 'green' };
    if (score === 3) return { label: 'Good', score, color: 'blue' };
    if (score === 2) return { label: 'Fair', score, color: 'amber' };
    return { label: 'Weak', score, color: 'red' };
  }, [password]);

  const passwordRequirements = useMemo(() => ({
    length: password.length >= 10,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^\w]/.test(password)
  }), [password]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

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
      const { data } = await api.post('/auth/signup', { name, email, password, reEnterPassword, role: userType });
      if (data?.success) {
        setSuccess('Account created successfully!');
        setCountdown(3);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              navigate('/login');
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(data?.message || 'Signup failed');
      }
    } catch (err) {
      if (err?.code === 'ERR_NETWORK') {
        setError('Unable to connect to server. Please check your connection.');
      } else if (err?.response?.status === 409) {
        setError('This email is already registered. Please sign in instead.');
      } else if (err?.response?.status === 400) {
        setError(err?.response?.data?.message || 'Invalid input. Please check your details.');
      } else {
        setError(err?.response?.data?.message || 'Signup failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const cardClass = error ? 'animate-shake' : success ? 'animate-success' : '';
  const passwordsMatch = reEnterPassword && password === reEnterPassword;

  return (
    <AuthCard 
      title="Create Account" 
      subtitle="Join your team"
      className={cardClass}
    >
      <form onSubmit={onSubmit} className="auth-form">
        <div className="input-group">
          <label htmlFor="userType">Sign Up As</label>
          <select
            id="userType"
            value={userType}
            onChange={(e) => setUserType(e.target.value)}
            className="input-select"
          >
            <option value="user">User</option>
            <option value="technician">Technician</option>
          </select>
        </div>

        <div className="signup-grid">
          <div className="input-group">
            <label htmlFor="name">Full Name</label>
            <input 
              id="name"
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="John Doe"
              autoComplete="name"
              required 
            />
          </div>

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
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <div className="password-input">
            <input 
              id="password"
              type={showPassword ? "text" : "password"}
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Create a strong password"
              autoComplete="new-password"
              minLength="8"
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
          {password && (
            <div className="password-requirements">
              <div className={passwordRequirements.length ? 'req-met' : 'req-unmet'}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  {passwordRequirements.length ? <polyline points="2,6 5,9 10,3"/> : <circle cx="6" cy="6" r="5"/>}
                </svg>
                10+ chars
              </div>
              <div className={passwordRequirements.uppercase ? 'req-met' : 'req-unmet'}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  {passwordRequirements.uppercase ? <polyline points="2,6 5,9 10,3"/> : <circle cx="6" cy="6" r="5"/>}
                </svg>
                Uppercase
              </div>
              <div className={passwordRequirements.lowercase ? 'req-met' : 'req-unmet'}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  {passwordRequirements.lowercase ? <polyline points="2,6 5,9 10,3"/> : <circle cx="6" cy="6" r="5"/>}
                </svg>
                Lowercase
              </div>
              <div className={passwordRequirements.number ? 'req-met' : 'req-unmet'}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  {passwordRequirements.number ? <polyline points="2,6 5,9 10,3"/> : <circle cx="6" cy="6" r="5"/>}
                </svg>
                Number
              </div>
              <div className={passwordRequirements.special ? 'req-met' : 'req-unmet'}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  {passwordRequirements.special ? <polyline points="2,6 5,9 10,3"/> : <circle cx="6" cy="6" r="5"/>}
                </svg>
                Special
              </div>
            </div>
          )}
          {password && (
            <div className={`strength-indicator strength-${passwordStrength.color}`}>
              <div className="strength-bar">
                <span className={`strength-segment ${passwordStrength.score >= 1 ? 'active' : ''}`} />
                <span className={`strength-segment ${passwordStrength.score >= 2 ? 'active' : ''}`} />
                <span className={`strength-segment ${passwordStrength.score >= 3 ? 'active' : ''}`} />
                <span className={`strength-segment ${passwordStrength.score >= 4 ? 'active' : ''}`} />
                <span className={`strength-segment ${passwordStrength.score >= 5 ? 'active' : ''}`} />
              </div>
              <span className="strength-label">{passwordStrength.label}</span>
            </div>
          )}
        </div>

        <div className="input-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <div className="password-input">
            <input 
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={reEnterPassword} 
              onChange={(e) => setReEnterPassword(e.target.value)} 
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required 
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
          {reEnterPassword && (
            <small className={`input-feedback ${passwordsMatch ? 'success' : 'error'}`}>
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                {passwordsMatch ? 
                  <polyline points="2,7 6,11 12,3"/> : 
                  <><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></>
                }
              </svg>
              {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
            </small>
          )}
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {success && (
          <div className="alert alert-success" role="alert">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{success} {countdown !== null && `Redirecting in ${countdown}...`}</span>
              {countdown !== null && (
                <button 
                  type="button" 
                  className="link-secondary" 
                  onClick={() => navigate('/login')}
                >
                  Skip →
                </button>
              )}
            </div>
          </div>
        )}

        <button type="submit" disabled={loading || !passwordsMatch} className="btn-primary">
          {loading ? (
            <><span className="spinner" /> Creating account...</>
          ) : (
            'Create Account'
          )}
        </button>
      </form>
    </AuthCard>
  );
}
