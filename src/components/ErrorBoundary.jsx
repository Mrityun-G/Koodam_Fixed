import React from 'react';
import { reportError } from '../lib/errorTracking';

// Catches a crash during rendering.
//
// Without this, one thrown error unmounts the whole app and the person
// is left looking at a blank white screen with no way forward. This
// keeps them inside GigEzee, reports the fault, and offers the two things
// that usually help: try again, or go back to the start.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    reportError(
      Object.assign(error, {
        stack: `${error.stack || ''}\n--- component stack ---${info?.componentStack || ''}`
      }),
      'render'
    );
  }

  handleRetry = () => {
    this.setState({ crashed: false });
  };

  handleRestart = () => {
    // Clears the screen the crash happened on, so a reload doesn't land
    // straight back on it. Their login is untouched. Same key as
    // ACTIVE_ORDER_KEY in context/AppContext.jsx, which keeps it in
    // sessionStorage during development and localStorage otherwise.
    try {
      sessionStorage.removeItem('gigezee-active-order');
      localStorage.removeItem('gigezee-active-order');
    } catch {
      // Nothing to clear
    }

    window.location.href = '/';
  };

  render() {
    if (!this.state.crashed) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF3D5] px-6 py-10">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE7A8]">
            <span
              className="material-symbols-outlined text-[32px] text-[#F47B16]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              sentiment_dissatisfied
            </span>
          </div>

          <h1 className="text-lg font-extrabold text-[#101F55]">
            Something went wrong
          </h1>

          <p className="mt-2 text-xs leading-relaxed text-[#4E5C92]">
            Sorry — GigEzee hit a problem on this screen. Nothing you had
            booked is affected, and our team has been told about it.
          </p>

          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-[#FFC928] to-[#FFD65A] py-3.5 text-sm font-bold text-[#101F55] shadow-lg shadow-[#FFC928]/30 active:scale-98 transition-all"
          >
            Try again
          </button>

          <button
            type="button"
            onClick={this.handleRestart}
            className="mt-2.5 w-full rounded-full border border-slate-200 bg-white py-3.5 text-sm font-bold text-[#101F55] active:scale-98 transition-all"
          >
            Back to start
          </button>

          <p className="mt-5 text-[11px] text-slate-400">
            If it keeps happening, please contact GigEzee support.
          </p>
        </div>
      </div>
    );
  }
}
