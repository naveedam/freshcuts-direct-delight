import { Link } from 'react-router-dom';
import { ShoppingCart, User, Menu, X, LogOut, Settings, Package, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { categories } from '@/hooks/useProducts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { totalItems } = useCart();
  const { user, signOut, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border shadow-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="font-heading text-xl md:text-2xl font-bold text-primary">
              FreshCuts
            </span>
            <span className="font-heading text-lg md:text-xl text-gold">, Daily</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link 
              to="/" 
              className="font-body text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Home
            </Link>
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/category/${cat.id}`}
                className="font-body text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                {cat.name}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Button>
            </Link>
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 hidden md:flex">
                    <User className="h-4 w-4" />
                    Account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account/orders" className="cursor-pointer">
                      <Package className="h-4 w-4 mr-2" />
                      Order History
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/profile" className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      Profile Settings
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="cursor-pointer text-primary">
                          <Shield className="h-4 w-4 mr-2" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth" className="hidden md:block">
                <Button variant="outline" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex flex-col gap-4">
              <Link 
                to="/" 
                className="font-body text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              {categories.map(cat => (
                <Link
                  key={cat.id}
                  to={`/category/${cat.id}`}
                  className="font-body text-sm font-medium text-foreground hover:text-primary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {cat.name}
                </Link>
              ))}
              
              {user ? (
                <>
                  <div className="border-t border-border pt-4 mt-2">
                    <p className="text-xs text-muted-foreground mb-2">{user.email}</p>
                    <div className="flex flex-col gap-2">
                      <Link to="/account/orders" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                          <Package className="h-4 w-4" />
                          Order History
                        </Button>
                      </Link>
                      <Link to="/account/profile" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                          <Settings className="h-4 w-4" />
                          Profile Settings
                        </Button>
                      </Link>
                      {isAdmin && (
                        <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-primary">
                            <Shield className="h-4 w-4" />
                            Admin Panel
                          </Button>
                        </Link>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start gap-2 text-destructive"
                        onClick={() => {
                          signOut();
                          setMobileMenuOpen(false);
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <Link 
                  to="/auth"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button variant="outline" size="sm" className="gap-2 w-full">
                    <User className="h-4 w-4" />
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
