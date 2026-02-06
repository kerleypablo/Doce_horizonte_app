import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './modules/auth/LoginPage.tsx';
import { ProtectedLayout } from './modules/auth/ProtectedLayout.tsx';
import { DashboardPage } from './modules/dashboard/DashboardPage.tsx';
import { InputsPage } from './modules/inputs/InputsPage.tsx';
import { RecipesPage } from './modules/recipes/RecipesPage.tsx';
import { ProductsPage } from './modules/products/ProductsPage.tsx';
import { CompanySettingsPage } from './modules/company/CompanySettingsPage.tsx';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/insumos" element={<InputsPage />} />
        <Route path="/app/receitas" element={<RecipesPage />} />
        <Route path="/app/produtos" element={<ProductsPage />} />
        <Route path="/app/empresa" element={<CompanySettingsPage />} />
      </Route>
    </Routes>
  );
};

export default App;
