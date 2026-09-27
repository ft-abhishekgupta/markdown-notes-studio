import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/lexend/700.css';

import './styles/base.css';
import './styles/layout.css';
import './styles/prose.css';
import './styles/pages.css';
import './styles/editor.css';

import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './components/Toast';
import { LightboxProvider } from './components/Lightbox';
import { WorkspaceProvider } from './lib/workspace';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <LightboxProvider>
          <WorkspaceProvider>
            <HashRouter>
              <App />
            </HashRouter>
          </WorkspaceProvider>
        </LightboxProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
