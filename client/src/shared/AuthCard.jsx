import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function AuthCard({ title, subtitle, children, className }) {
  const { pathname } = useLocation();
  const isLogin = pathname.includes('login');

  return (
    <div className="auth-layout">
      <div className="auth-backdrop" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <div className={`auth-card ${className || ''}`}>
        <div className="card-header">
          <div className="brand">GearGuard</div>
          <h1>{title}</h1>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>

        <div className="auth-switch">
          {isLogin ? (
            <>Don't have an account? <Link to="/signup">Sign up</Link></>
          ) : (
            <>Already have an account? <Link to="/login">Sign in</Link></>
          )}
        </div>

        {children}
      </div>

      <p className="caption">
        Secure equipment management for operations teams.
      </p>
    </div>
  );
}
