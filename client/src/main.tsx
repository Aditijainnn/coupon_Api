import '@fontsource-variable/archivo/wdth.css';
import './styles.css';

import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html is missing the <div id="root"> element');
}

createRoot(root).render(
  <StrictMode>
    {/* "user" follows the "reduce motion" setting of the operating system: movement is switched off. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
