import { Header } from './Header';
import { Footer } from './Footer';
import { WhatsAppButton } from '@/components/whatsapp/WhatsAppButton';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      {/* Bottom room so the WhatsApp button never covers the last row of cards. */}
      <main className="flex-1 pb-20">
        {children}
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
