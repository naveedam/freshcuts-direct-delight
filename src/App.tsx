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
import OrdersAdmin from "./pages/admin/OrdersAdmin";
import ContentAdmin from "./pages/admin/ContentAdmin";
import BusinessSettings from "./pages/admin/BusinessSettings";
import ShippingSettings from "./pages/admin/ShippingSettings";
import GSTConfigAdmin from "./pages/admin/GSTConfigAdmin";
import GSTReportsAdmin from "./pages/admin/GSTReportsAdmin";
import VendorsAdmin from "./pages/admin/VendorsAdmin";
import PurchaseOrdersAdmin from "./pages/admin/PurchaseOrdersAdmin";
import CategoriesAdmin from "./pages/admin/CategoriesAdmin";
import DocumentsAdmin from "./pages/admin/DocumentsAdmin";
import BulkUploadAdmin from "./pages/admin/BulkUploadAdmin";
import FinancialYearsAdmin from "./pages/admin/FinancialYearsAdmin";
import OrderHistory from "./pages/account/OrderHistory";
import OrderDetails from "./pages/account/OrderDetails";
import ProfileSettings from "./pages/account/ProfileSettings";
import UserDashboard from "./pages/account/UserDashboard";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

const queryClient = new QueryClient();

const App = () => (
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
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/products" element={<ProductsAdmin />} />
              <Route path="/admin/products/bulk-upload" element={<BulkUploadAdmin />} />
              <Route path="/admin/categories" element={<CategoriesAdmin />} />
              <Route path="/admin/orders" element={<OrdersAdmin />} />
              <Route path="/admin/vendors" element={<VendorsAdmin />} />
              <Route path="/admin/purchase-orders" element={<PurchaseOrdersAdmin />} />
              <Route path="/admin/documents" element={<DocumentsAdmin />} />
              <Route path="/admin/shipping" element={<ShippingSettings />} />
              <Route path="/admin/gst" element={<GSTConfigAdmin />} />
              <Route path="/admin/gst-reports" element={<GSTReportsAdmin />} />
              <Route path="/admin/content" element={<ContentAdmin />} />
              <Route path="/admin/settings" element={<BusinessSettings />} />
              <Route path="/admin/financial-years" element={<FinancialYearsAdmin />} />
              
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
);

export default App;
