import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { PORTAL } from './context/AppContext';
import './index.css';

if (PORTAL === 'partner') {
  document.title = 'GigEzee Partner';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
