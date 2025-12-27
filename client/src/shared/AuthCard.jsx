import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function AuthCard({ title, children, className }) {
  const { pathname } = useLocation();
  const isLogin = pathname.includes('login');
  return (
    <div className="auth-layout">
      <div className={`auth-card ${className || ''}`}>
        <div className="brand">GearGuard Portal</div>
        <h2>{title}</h2>
        <div className="muted" style={{marginBottom:8}}>
          {isLogin ? (
            <>New here? <Link to="/signup">Create an account</Link></>
          ) : (
            <>Already have an account? <Link to="/login">Sign in</Link></>
          )}
        </div>
        {children}
      </div>
      <div className="caption">
        Clean, responsive layout with subtle motion and dark theme.
      </div>
    </div>
  );
}
