import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WorkspaceProvider } from './api/workspace';
import '@fontsource/noto-sans-sc/400.css';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </React.StrictMode>,
);
