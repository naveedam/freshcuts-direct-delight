import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppOrderDialog } from './WhatsAppOrderDialog';

export function WhatsAppButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {/* A small round button tucked into the corner so it doesn't sit over the product cards;
          the "Order on WhatsApp" label slides out on hover (desktop). */}
      <Button
        onClick={() => setDialogOpen(true)}
        aria-label="Order on WhatsApp"
        title="Order on WhatsApp"
        className="group fixed bottom-4 right-4 z-50 h-12 min-w-12 gap-0 rounded-full bg-[#25D366] p-0 px-3 shadow-lg ring-4 ring-white/70 hover:bg-[#20BA5A] md:bottom-5 md:right-5"
        size="lg"
      >
        <MessageCircle className="h-6 w-6 shrink-0 fill-white text-white" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap font-medium text-white transition-all duration-300 md:group-hover:ml-2 md:group-hover:max-w-[12rem]">
          Order on WhatsApp
        </span>
      </Button>

      <WhatsAppOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
