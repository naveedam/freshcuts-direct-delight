import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppOrderDialog } from './WhatsAppOrderDialog';

export function WhatsAppButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 gap-2 rounded-full bg-[#25D366] px-5 shadow-lg hover:bg-[#20BA5A] md:h-12"
        size="lg"
      >
        <MessageCircle className="h-6 w-6 fill-white text-white" />
        <span className="hidden font-medium text-white sm:inline">Order on WhatsApp</span>
      </Button>

      <WhatsAppOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
