import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './modules/auth/LoginPage.tsx';
import { RegisterPage } from './modules/auth/RegisterPage.tsx';
import { OAuthCallbackPage } from './modules/auth/OAuthCallbackPage.tsx';
import { OnboardingPage } from './modules/auth/OnboardingPage.tsx';
import { ProtectedLayout } from './modules/auth/ProtectedLayout.tsx';
import { DashboardPage } from './modules/dashboard/DashboardPage.tsx';
import { InputsPage } from './modules/inputs/InputsPage.tsx';
import { RecipesPage } from './modules/recipes/RecipesPage.tsx';
import { ProductsPage } from './modules/products/ProductsPage.tsx';
import { CompanySettingsPage } from './modules/company/CompanySettingsPage.tsx';
import { CustomersPage } from './modules/customers/CustomersPage.tsx';
import { OrdersPage } from './modules/orders/OrdersPage.tsx';
import { SettingsPage } from './modules/settings/SettingsPage.tsx';
import { TasksBoardPage } from './modules/tasks/TasksBoardPage.tsx';
import { BackofficePage } from './modules/backoffice/BackofficePage.tsx';
import {
  FinanceAccountsPage,
  FinanceDashboardPage,
  FinanceExpensesPage,
  FinanceManualSalesPage,
  FinanceRulesPage
} from './modules/finance/FinancePages.tsx';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/oauth" element={<OAuthCallbackPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/insumos" element={<InputsPage />} />
        <Route path="/app/insumos/novo" element={<InputsPage />} />
        <Route path="/app/insumos/editar/:inputId" element={<InputsPage />} />
        <Route path="/app/receitas" element={<RecipesPage />} />
        <Route path="/app/receitas/novo" element={<RecipesPage />} />
        <Route path="/app/receitas/editar/:recipeId" element={<RecipesPage />} />
        <Route path="/app/produtos" element={<ProductsPage />} />
        <Route path="/app/produtos/novo" element={<ProductsPage />} />
        <Route path="/app/produtos/editar/:productId" element={<ProductsPage />} />
        <Route path="/app/clientes" element={<CustomersPage />} />
        <Route path="/app/clientes/novo" element={<CustomersPage />} />
        <Route path="/app/clientes/editar/:customerId" element={<CustomersPage />} />
        <Route path="/app/pedidos" element={<OrdersPage />} />
        <Route path="/app/pedidos/novo" element={<OrdersPage />} />
        <Route path="/app/pedidos/:orderId" element={<OrdersPage />} />
        <Route path="/app/financeiro" element={<FinanceDashboardPage />} />
        <Route path="/app/financeiro/contas" element={<FinanceAccountsPage />} />
        <Route path="/app/financeiro/contas/novo" element={<FinanceAccountsPage />} />
        <Route path="/app/financeiro/contas/editar/:accountId" element={<FinanceAccountsPage />} />
        <Route path="/app/financeiro/regras" element={<FinanceRulesPage />} />
        <Route path="/app/financeiro/vendas-manuais" element={<FinanceManualSalesPage />} />
        <Route path="/app/financeiro/vendas-manuais/novo" element={<FinanceManualSalesPage />} />
        <Route path="/app/financeiro/vendas-manuais/editar/:saleId" element={<FinanceManualSalesPage />} />
        <Route path="/app/financeiro/despesas" element={<FinanceExpensesPage />} />
        <Route path="/app/financeiro/despesas/novo" element={<FinanceExpensesPage />} />
        <Route path="/app/financeiro/despesas/editar/:expenseId" element={<FinanceExpensesPage />} />
        <Route path="/app/tasks" element={<TasksBoardPage />} />
        <Route path="/app/empresa" element={<CompanySettingsPage />} />
        <Route path="/app/configuracoes" element={<SettingsPage />} />
        <Route path="/backoffice" element={<BackofficePage />} />
      </Route>
    </Routes>
  );
};

export default App;
