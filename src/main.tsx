import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Editor from './routes/Editor';
import './index.css';

const Animate = lazy(() => import('./routes/Animate'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/yamazumi">
      <Routes>
        <Route path="/" element={<Editor />} />
        <Route
          path="/animate"
          element={
            <Suspense fallback={null}>
              <Animate />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
