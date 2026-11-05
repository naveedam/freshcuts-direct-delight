import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import Index from "./pages/Index";
import CategoryPage from "./pages/CategoryPage";
import ProductPage from "./pages/ProductPage";
import CartPage from "./pages/CartPage";
import AuthPage from "./pages/AuthPage";
import CheckoutPage from "./pages/CheckoutPage";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/Dashboard";
import ProductsAdmin from "./pages/admin/ProductsAdmin";
import TodaysCatchAdmin from "./pages/admin/TodaysCatchAdmin";
import ChickenRateAdmin from "./pages/admin/ChickenRateAdmin";
import SeafoodRateAdmin from "./pages/admin/SeafoodRateAdmin";
import MuttonRateAdmin from "./pages/admin/MuttonRateAdmin";
import PriceHistoryAdmin from "./pages/admin/PriceHistoryAdmin";
import OrdersAdmin from "./pages/admin/OrdersAdmin";
import ContentAdmin from "./pages/admin/ContentAdmin";
import BusinessSettings from "./pages/admin/BusinessSettings";
import ShippingSettings from "./pages/admin/ShippingSettings";
import GSTConfigAdmin from "./pages/admin/GSTConfigAdmin";
import GSTReportsAdmin from "./pages/admin/GSTReportsAdmin";
import ExpensesAdmin from "./pages/admin/ExpensesAdmin";
import VendorsAdmin from "./pages/admin/VendorsAdmin";
import PurchaseOrdersAdmin from "./pages/admin/PurchaseOrdersAdmin";
import VendorLedger from "./pages/admin/VendorLedger";
import VendorProfitability from "./pages/admin/VendorProfitability";
import CategoriesAdmin from "./pages/admin/CategoriesAdmin";
import DocumentsAdmin from "./pages/admin/DocumentsAdmin";
import BulkUploadAdmin from "./pages/admin/BulkUploadAdmin";
import FinancialYearsAdmin from "./pages/admin/FinancialYearsAdmin";
import DeliveryRunsAdmin from "./pages/admin/DeliveryRunsAdmin";
import SearchAdmin from "./pages/admin/SearchAdmin";
import OrderHistory from "./pages/account/OrderHistory";
import OrderDetails from "./pages/account/OrderDetails";
import ProfileSettings from "./pages/account/ProfileSettings";
import UserDashboard from "./pages/account/UserDashboard";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { RequireAdmin } from "./components/auth/RequireAdmin";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/category/:categoryId" element={<CategoryPage />} />
              <Route path="/product/:productId" element={<ProductPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              
              {/* Admin Routes */}
              <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
              <Route path="/admin/products" element={<RequireAdmin><ProductsAdmin /></RequireAdmin>} />
              <Route path="/admin/todays-catch" element={<RequireAdmin><TodaysCatchAdmin /></RequireAdmin>} />
              <Route path="/admin/chicken-rate" element={<RequireAdmin><ChickenRateAdmin /></RequireAdmin>} />
              <Route path="/admin/seafood-rate" element={<RequireAdmin><SeafoodRateAdmin /></RequireAdmin>} />
              <Route path="/admin/mutton-rate" element={<RequireAdmin><MuttonRateAdmin /></RequireAdmin>} />
              <Route path="/admin/price-history" element={<RequireAdmin><PriceHistoryAdmin /></RequireAdmin>} />
              <Route path="/admin/products/bulk-upload" element={<RequireAdmin><BulkUploadAdmin /></RequireAdmin>} />
              <Route path="/admin/categories" element={<RequireAdmin><CategoriesAdmin /></RequireAdmin>} />
              <Route path="/admin/orders" element={<RequireAdmin><OrdersAdmin /></RequireAdmin>} />
              <Route path="/admin/vendors" element={<RequireAdmin><VendorsAdmin /></RequireAdmin>} />
              <Route path="/admin/purchase-orders" element={<RequireAdmin><PurchaseOrdersAdmin /></RequireAdmin>} />
              <Route path="/admin/vendor-ledger" element={<RequireAdmin><VendorLedger /></RequireAdmin>} />
              <Route path="/admin/vendor-profitability" element={<RequireAdmin><VendorProfitability /></RequireAdmin>} />
              <Route path="/admin/documents" element={<RequireAdmin><DocumentsAdmin /></RequireAdmin>} />
              <Route path="/admin/shipping" element={<RequireAdmin><ShippingSettings /></RequireAdmin>} />
              <Route path="/admin/gst" element={<RequireAdmin><GSTConfigAdmin /></RequireAdmin>} />
              <Route path="/admin/gst-reports" element={<RequireAdmin><GSTReportsAdmin /></RequireAdmin>} />
              <Route path="/admin/expenses" element={<RequireAdmin><ExpensesAdmin /></RequireAdmin>} />
              <Route path="/admin/content" element={<RequireAdmin><ContentAdmin /></RequireAdmin>} />
              <Route path="/admin/settings" element={<RequireAdmin><BusinessSettings /></RequireAdmin>} />
              <Route path="/admin/financial-years" element={<RequireAdmin><FinancialYearsAdmin /></RequireAdmin>} />
              <Route path="/admin/delivery-runs" element={<RequireAdmin><DeliveryRunsAdmin /></RequireAdmin>} />
              <Route path="/admin/search" element={<RequireAdmin><SearchAdmin /></RequireAdmin>} />
              
              {/* Account Routes */}
              <Route path="/account" element={<UserDashboard />} />
              <Route path="/account/orders" element={<OrderHistory />} />
              <Route path="/account/orders/:orderId" element={<OrderDetails />} />
              <Route path="/account/profile" element={<ProfileSettings />} />
              
              <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
