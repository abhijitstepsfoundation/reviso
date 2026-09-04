import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import Protected from './components/Protected';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Materials from './pages/Materials';
import Exam from './pages/Exam';
import Written from './pages/Written';
import Profile from './pages/Profile';
import Review from './pages/Review';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />
          <Route
            path="/materials"
            element={
              <Protected>
                <Materials />
              </Protected>
            }
          />
          <Route
            path="/exam"
            element={
              <Protected>
                <Exam />
              </Protected>
            }
          />
          <Route
            path="/written"
            element={
              <Protected>
                <Written />
              </Protected>
            }
          />
          <Route
            path="/profile"
            element={
              <Protected>
                <Profile />
              </Protected>
            }
          />
          <Route
            path="/review/:type/:id"
            element={
              <Protected>
                <Review />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
