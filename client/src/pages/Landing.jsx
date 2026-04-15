import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing-layout">
      <div className="auth-backdrop">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <header className="landing-nav">
        <div className="brand">GearGuard</div>
        <div className="landing-nav-actions">
          <Link to="/login" className="btn-secondary">Log In</Link>
          <Link to="/signup" className="btn-accent">Sign Up</Link>
        </div>
      </header>

      <main className="landing-hero">
        <div className="landing-copy">
          <span className="landing-kicker">Maintenance. Visibility. Control.</span>
          <h1>Keep every machine healthy and every team aligned.</h1>
          <p>
            GearGuard helps your operations team manage requests, track maintenance timelines,
            and reduce downtime from one central dashboard.
          </p>

          <div className="landing-cta-row">
            <Link to="/login" className="btn-accent landing-cta">Log In</Link>
            <Link to="/signup" className="btn-secondary landing-cta">Create Account</Link>
          </div>
        </div>

        <section className="landing-highlights" aria-label="GearGuard highlights">
          <article className="landing-highlight-card">
            <h3>Live Request Tracking</h3>
            <p>Follow every maintenance request from reported to resolved with clear status updates.</p>
          </article>

          <article className="landing-highlight-card">
            <h3>Role-Based Dashboards</h3>
            <p>Give technicians, managers, and admins the right view without extra complexity.</p>
          </article>

          <article className="landing-highlight-card">
            <h3>Team Coordination</h3>
            <p>Keep work centers, teams, and maintenance schedules synchronized across shifts.</p>
          </article>
        </section>
      </main>

      <section className="landing-section" aria-labelledby="features-title">
        <div className="landing-section-header">
          <p className="landing-section-kicker">Built for operations teams</p>
          <h2 id="features-title">Everything you need to run maintenance without the chaos.</h2>
          <p>
            From intake to resolution, GearGuard keeps work visible, scheduled, and accountable
            across every role.
          </p>
        </div>

        <div className="landing-features-grid">
          <article className="landing-feature-card">
            <div className="landing-feature-icon">01</div>
            <h3>Request Intake Hub</h3>
            <p>Capture issues, prioritize jobs, and assign technicians in seconds.</p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-feature-icon">02</div>
            <h3>Maintenance Calendar</h3>
            <p>Plan preventive work and avoid production surprises with clear scheduling.</p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-feature-icon">03</div>
            <h3>Equipment Catalog</h3>
            <p>Track assets, work centers, and tool history in one connected view.</p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-feature-icon">04</div>
            <h3>Technician Workbench</h3>
            <p>Surface active jobs, notes, and progress updates with zero noise.</p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-feature-icon">05</div>
            <h3>Smart Status Signals</h3>
            <p>Know what is blocked, in progress, or complete at a glance.</p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-feature-icon">06</div>
            <h3>Team Coordination</h3>
            <p>Keep managers, admins, and technicians working off the same playbook.</p>
          </article>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="insights-title">
        <div className="landing-section-header">
          <p className="landing-section-kicker">Real-time clarity</p>
          <h2 id="insights-title">See the signals that keep operations moving.</h2>
          <p>Track performance and workload with dashboards designed for fast decisions.</p>
        </div>

        <div className="landing-metrics">
          <div className="landing-metric-card">
            <h3>Live workload</h3>
            <p className="metric-value">24 active jobs</p>
            <p className="metric-caption">Stay ahead of demand with instant visibility.</p>
          </div>
          <div className="landing-metric-card">
            <h3>Response time</h3>
            <p className="metric-value">-32% downtime</p>
            <p className="metric-caption">Reduce slowdowns with clear accountability.</p>
          </div>
          <div className="landing-metric-card">
            <h3>Team alignment</h3>
            <p className="metric-value">3x faster handoffs</p>
            <p className="metric-caption">Keep every role on the same timeline.</p>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="workflow-title">
        <div className="landing-section-header">
          <p className="landing-section-kicker">Simple workflow</p>
          <h2 id="workflow-title">From report to resolution in three tight steps.</h2>
        </div>

        <div className="landing-steps">
          <div className="landing-step">
            <span>1</span>
            <h3>Report the issue</h3>
            <p>Log equipment failures and attach details instantly.</p>
          </div>
          <div className="landing-step">
            <span>2</span>
            <h3>Assign and schedule</h3>
            <p>Route work to the right technician with due dates built in.</p>
          </div>
          <div className="landing-step">
            <span>3</span>
            <h3>Close the loop</h3>
            <p>Track progress, verify repairs, and keep stakeholders informed.</p>
          </div>
        </div>
      </section>

      <section className="landing-cta-band">
        <div>
          <h2>Ready to run maintenance like a modern ops team?</h2>
          <p>Launch GearGuard in minutes and keep every asset in peak condition.</p>
        </div>
        <div className="landing-cta-row">
          <Link to="/login" className="btn-accent landing-cta">Log In</Link>
          <Link to="/signup" className="btn-secondary landing-cta">Start Free</Link>
        </div>
      </section>
    </div>
  );
}
