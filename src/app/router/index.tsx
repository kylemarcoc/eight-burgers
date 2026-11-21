import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { KioskShell } from '@/app/components/KioskShell';
import { AdminPage } from '@/routes/AdminPage';
import { HomePage } from '@/routes/HomePage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { ShopProvider } from '@/shared/shop/ShopProvider';

function AppRouter() {
  return (
    <ShopProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<KioskShell />}>
            <Route index element={<HomePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ShopProvider>
  );
}

export default AppRouter;
