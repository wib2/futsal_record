// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // <- 대소문자/경로 주의
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
