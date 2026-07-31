import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function AuthCard({ title, subtitle, children, className }) {
  const { pathname } = useLocation();
  const isLogin = pathname.includes('login');

  return (
    <div className="auth-layout">
      <main className="auth-shell">
        <section className="auth-brand-panel" aria-label="GearGuard product information">
          <div className="auth-brand-lockup">
            <span className="auth-brand-mark" aria-hidden="true">G</span>
            <div><strong>GearGuard</strong><span>Maintenance operations</span></div>
          </div>
          <div className="auth-brand-message">
            <p>Operational maintenance workspace</p>
            <h2>Keep work visible, assigned, and moving.</h2>
            <span>Coordinate requests, equipment, schedules, and maintenance teams from one focused workspace.</span>
          </div>
          <ul className="auth-product-points">
            <li>Clear ownership</li><li>Schedule visibility</li><li>Operational history</li>
          </ul>
        </section>

        <section className={`auth-card ${className || ''}`}>
          <div className="card-header">
            <p className="auth-eyebrow">{isLogin ? 'Welcome back' : 'Get started'}</p>
            <h1>{title}</h1>
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>

          {children}

          <div className="auth-switch">
            {isLogin ? (
              <>New to GearGuard? <Link to="/signup">Create an account</Link></>
            ) : (
              <>Already have an account? <Link to="/login">Sign in</Link></>
            )}
          </div>
        </section>
      </main>

      <p className="caption">Secure equipment management for operations teams.</p>
    </div>
  );
}
