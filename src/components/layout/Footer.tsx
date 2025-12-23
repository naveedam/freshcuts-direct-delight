import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-foreground text-primary-foreground">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-heading text-2xl font-bold text-primary-foreground">
                FreshCuts
              </span>
              <span className="font-heading text-xl text-gold">, Daily</span>
            </div>
            <p className="font-body text-sm text-primary-foreground/70 leading-relaxed">
              Premium quality meats delivered fresh to your doorstep. 
              Sourced from trusted farms, cut with precision, delivered with care.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-heading text-lg font-semibold">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/category/lamb" className="font-body text-sm text-primary-foreground/70 hover:text-gold transition-colors">
                  Lamb & Mutton
                </Link>
              </li>
              <li>
                <Link to="/category/poultry" className="font-body text-sm text-primary-foreground/70 hover:text-gold transition-colors">
                  Poultry
                </Link>
              </li>
              <li>
                <Link to="/category/seafood" className="font-body text-sm text-primary-foreground/70 hover:text-gold transition-colors">
                  Seafood & Fish
                </Link>
              </li>
              <li>
                <Link to="/cart" className="font-body text-sm text-primary-foreground/70 hover:text-gold transition-colors">
                  Shopping Cart
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="font-heading text-lg font-semibold">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gold" />
                <span className="font-body text-sm text-primary-foreground/70">(555) 123-4567</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gold" />
                <span className="font-body text-sm text-primary-foreground/70">orders@freshcutsdaily.com</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-gold mt-0.5" />
                <span className="font-body text-sm text-primary-foreground/70">
                  123 Butcher Street<br />
                  Fresh City, FC 12345
                </span>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div className="space-y-4">
            <h4 className="font-heading text-lg font-semibold">Delivery Hours</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gold" />
                <div className="font-body text-sm text-primary-foreground/70">
                  <p>Mon - Fri: 7am - 8pm</p>
                  <p>Sat - Sun: 8am - 6pm</p>
                </div>
              </li>
            </ul>
            <p className="font-body text-xs text-primary-foreground/50 mt-4">
              Free delivery on orders over $75
            </p>
          </div>
        </div>

        <div className="border-t border-primary-foreground/10 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="font-body text-sm text-primary-foreground/50">
              © 2024 FreshCuts, Daily. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link to="#" className="font-body text-xs text-primary-foreground/50 hover:text-gold transition-colors">
                Privacy Policy
              </Link>
              <Link to="#" className="font-body text-xs text-primary-foreground/50 hover:text-gold transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
