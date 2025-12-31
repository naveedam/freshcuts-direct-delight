import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Search, Loader2 } from 'lucide-react';

// Declare google maps types
declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          AutocompleteService: new () => AutocompleteServiceType;
          PlacesService: new (element: HTMLElement) => PlacesServiceType;
        };
        Map: new (element: HTMLElement, options: object) => object;
      };
    };
  }
}

interface AutocompletePrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface AutocompleteServiceType {
  getPlacePredictions: (
    request: { input: string; componentRestrictions?: { country: string } },
    callback: (predictions: AutocompletePrediction[] | null) => void
  ) => void;
}

interface PlaceResult {
  formatted_address?: string;
  geometry?: {
    location: {
      lat: () => number;
      lng: () => number;
    };
  };
  address_components?: Array<{
    types: string[];
    long_name: string;
  }>;
}

interface PlacesServiceType {
  getDetails: (
    request: { placeId: string; fields: string[] },
    callback: (place: PlaceResult | null) => void
  ) => void;
}

interface AddressData {
  address: string;
  city: string;
  postal_code: string;
  flat_number: string;
  apartment_name: string;
  latitude: number | null;
  longitude: number | null;
}

interface AddressPickerProps {
  value: AddressData;
  onChange: (data: AddressData) => void;
  googleMapsApiKey?: string;
}

export function AddressPicker({ value, onChange, googleMapsApiKey }: AddressPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompletePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const autocompleteService = useRef<AutocompleteServiceType | null>(null);
  const placesService = useRef<PlacesServiceType | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Load Google Maps script
  useEffect(() => {
    if (!googleMapsApiKey) return;
    
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      if (window.google?.maps) {
        setMapsLoaded(true);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, [googleMapsApiKey]);

  // Initialize services when maps loaded
  useEffect(() => {
    if (mapsLoaded && window.google?.maps) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      if (mapRef.current) {
        const map = new window.google.maps.Map(mapRef.current, { center: { lat: 0, lng: 0 }, zoom: 1 });
        placesService.current = new window.google.maps.places.PlacesService(mapRef.current);
      }
    }
  }, [mapsLoaded]);

  const searchPlaces = useCallback(async (query: string) => {
    if (!autocompleteService.current || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      autocompleteService.current.getPlacePredictions(
        { input: query, componentRestrictions: { country: 'in' } },
        (predictions) => {
          setSuggestions(predictions || []);
          setIsSearching(false);
        }
      );
    } catch (error) {
      console.error('Error searching places:', error);
      setIsSearching(false);
    }
  }, []);

  const handleSelectPlace = useCallback((placeId: string) => {
    if (!placesService.current) return;

    placesService.current.getDetails(
      { placeId, fields: ['formatted_address', 'geometry', 'address_components'] },
      (place) => {
        if (!place || !place.geometry?.location) return;

        let city = '';
        let postalCode = '';
        
        place.address_components?.forEach((component) => {
          if (component.types.includes('locality')) {
            city = component.long_name;
          }
          if (component.types.includes('postal_code')) {
            postalCode = component.long_name;
          }
        });

        onChange({
          ...value,
          address: place.formatted_address || '',
          city: city || value.city,
          postal_code: postalCode || value.postal_code,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng()
        });

        setSearchQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
      }
    );
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Google Maps Search (if API key available) */}
      {googleMapsApiKey && mapsLoaded && (
        <div className="space-y-2 relative">
          <Label>Search Location</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for your address..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                searchPlaces(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          
          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full bg-background border border-border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.place_id}
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3"
                  onMouseDown={() => handleSelectPlace(suggestion.place_id)}
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{suggestion.structured_formatting.main_text}</p>
                    <p className="text-xs text-muted-foreground">{suggestion.structured_formatting.secondary_text}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {/* Hidden map div for PlacesService */}
          <div ref={mapRef} className="hidden" />
        </div>
      )}

      {/* Manual address fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="flat_number">Flat / Door Number</Label>
          <Input
            id="flat_number"
            placeholder="e.g., 101, A-12"
            value={value.flat_number}
            onChange={(e) => onChange({ ...value, flat_number: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="apartment_name">Apartment / Building Name</Label>
          <Input
            id="apartment_name"
            placeholder="e.g., Prestige Lakeside"
            value={value.apartment_name}
            onChange={(e) => onChange({ ...value, apartment_name: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Street Address</Label>
        <Input
          id="address"
          placeholder="Street name, area"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            placeholder="e.g., Bangalore"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postal_code">Pincode</Label>
          <Input
            id="postal_code"
            placeholder="e.g., 560001"
            value={value.postal_code}
            onChange={(e) => onChange({ ...value, postal_code: e.target.value })}
          />
        </div>
      </div>

      {/* Show saved coordinates if available */}
      {value.latitude && value.longitude && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
          <MapPin className="h-4 w-4" />
          <span>Location saved: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</span>
        </div>
      )}
    </div>
  );
}