import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import Index from "./pages/Index";
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const ProductPage = lazy(() => import("./pages/ProductPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
import NotFound from "./pages/NotFound";
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const ProductManagementAdmin = lazy(() => import("./pages/admin/ProductManagementAdmin"));
const VendorManagementAdmin = lazy(() => import("./pages/admin/VendorManagementAdmin"));
const ExpensesManagementAdmin = lazy(() => import("./pages/admin/ExpensesManagementAdmin"));
const RateManagementAdmin = lazy(() => import("./pages/admin/RateManagementAdmin"));
const OrdersAdmin = lazy(() => import("./pages/admin/OrdersAdmin"));
const ContentAdmin = lazy(() => import("./pages/admin/ContentAdmin"));
const BusinessSettings = lazy(() => import("./pages/admin/BusinessSettings"));
const ShippingSettings = lazy(() => import("./pages/admin/ShippingSettings"));
const GSTConfigAdmin = lazy(() => import("./pages/admin/GSTConfigAdmin"));
const GSTReportsAdmin = lazy(() => import("./pages/admin/GSTReportsAdmin"));
const DocumentsAdmin = lazy(() => import("./pages/admin/DocumentsAdmin"));
const BulkUploadAdmin = lazy(() => import("./pages/admin/BulkUploadAdmin"));
const FinancialYearsAdmin = lazy(() => import("./pages/admin/FinancialYearsAdmin"));
const DeliveryRunsAdmin = lazy(() => import("./pages/admin/DeliveryRunsAdmin"));
const SearchAdmin = lazy(() => import("./pages/admin/SearchAdmin"));
const OrderHistory = lazy(() => import("./pages/account/OrderHistory"));
const OrderDetails = lazy(() => import("./pages/account/OrderDetails"));
const ProfileSettings = lazy(() => import("./pages/account/ProfileSettings"));
const UserDashboard = lazy(() => import("./pages/account/UserDashboard"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
import { RequireAdmin } from "./components/auth/RequireAdmin";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();

// Each screen is downloaded only when it is opened, so the first load stays small on phones.
const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<PageLoading />}>
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
              <Route path="/admin/products" element={<RequireAdmin><ProductManagementAdmin /></RequireAdmin>} />
              <Route path="/admin/rates" element={<RequireAdmin><RateManagementAdmin /></RequireAdmin>} />
              {/* Retired screens: old links open the matching Rate Management tab */}
              <Route path="/admin/chicken-rate" element={<Navigate to="/admin/rates?tab=chicken" replace />} />
              <Route path="/admin/mutton-rate" element={<Navigate to="/admin/rates?tab=mutton" replace />} />
              <Route path="/admin/seafood-rate" element={<Navigate to="/admin/rates?tab=seafood" replace />} />
              <Route path="/admin/todays-catch" element={<Navigate to="/admin/rates?tab=seafood" replace />} />
              <Route path="/admin/price-history" element={<Navigate to="/admin/rates" replace />} />
              <Route path="/admin/products/bulk-upload" element={<RequireAdmin><BulkUploadAdmin /></RequireAdmin>} />
              <Route path="/admin/categories" element={<Navigate to="/admin/products?tab=categories" replace />} />
              <Route path="/admin/orders" element={<RequireAdmin><OrdersAdmin /></RequireAdmin>} />
              <Route path="/admin/vendors" element={<RequireAdmin><VendorManagementAdmin /></RequireAdmin>} />
              <Route path="/admin/purchase-orders" element={<Navigate to="/admin/vendors?tab=purchase-orders" replace />} />
              <Route path="/admin/vendor-ledger" element={<Navigate to="/admin/vendors?tab=ledger" replace />} />
              <Route path="/admin/vendor-profitability" element={<Navigate to="/admin/vendors?tab=profitability" replace />} />
              <Route path="/admin/documents" element={<RequireAdmin><DocumentsAdmin /></RequireAdmin>} />
              <Route path="/admin/shipping" element={<RequireAdmin><ShippingSettings /></RequireAdmin>} />
              <Route path="/admin/gst" element={<RequireAdmin><GSTConfigAdmin /></RequireAdmin>} />
              <Route path="/admin/gst-reports" element={<RequireAdmin><GSTReportsAdmin /></RequireAdmin>} />
              <Route path="/admin/expenses" element={<RequireAdmin><ExpensesManagementAdmin /></RequireAdmin>} />
              <Route path="/admin/delivery-partners" element={<Navigate to="/admin/expenses?tab=advances" replace />} />
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
              </Suspense>
            </BrowserRouter>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
