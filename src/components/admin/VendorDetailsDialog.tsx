import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Phone, Mail, MapPin, CreditCard, FileText, Calendar } from 'lucide-react';
import { Vendor } from '@/types/vendor';
import { format } from 'date-fns';

interface VendorDetailsDialogProps {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorDetailsDialog({ vendor, open, onOpenChange }: VendorDetailsDialogProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inactive</Badge>;
      case 'blacklisted':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Blacklisted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">{vendor.name}</DialogTitle>
              {vendor.contact_person && (
                <p className="text-sm text-muted-foreground">{vendor.contact_person}</p>
              )}
            </div>
            <div className="ml-auto">{getStatusBadge(vendor.status)}</div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 mt-4">
          {/* Contact Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{vendor.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{vendor.phone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Terms</span>
                <span>{vendor.payment_terms || '-'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Address
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {vendor.address || vendor.city || vendor.state ? (
                <div>
                  {vendor.address && <p>{vendor.address}</p>}
                  <p>
                    {[vendor.city, vendor.state, vendor.postal_code].filter(Boolean).join(', ')}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">No address provided</p>
              )}
            </CardContent>
          </Card>

          {/* Tax Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Tax Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">GSTIN</span>
                <span className="font-mono">{vendor.gstin || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PAN Number</span>
                <span className="font-mono">{vendor.pan_number || '-'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Banking Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Banking Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank Name</span>
                <span>{vendor.bank_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Number</span>
                <span className="font-mono">{vendor.bank_account_number || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IFSC Code</span>
                <span className="font-mono">{vendor.bank_ifsc || '-'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Notes & Dates */}
          {vendor.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{vendor.notes}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created: {format(new Date(vendor.created_at), 'dd MMM yyyy')}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Updated: {format(new Date(vendor.updated_at), 'dd MMM yyyy')}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
