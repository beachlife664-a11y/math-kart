import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import MathKartPage from '@/pages/MathKart/MathKartPage';
import NotFoundPage from '@/pages/NotFoundPage/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MathKartPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
