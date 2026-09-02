import React, { createContext, useContext, useState, useEffect } from 'react';
import { trackStorefrontEvent } from '@/components/ConsentManager';
import { changeCartLineSelection, isSameCartLine } from '@/lib/purchasing';

export type CartItem = {
  slug: string;
  name: string;
  img: string;
  price: number;
  size: string;
  selectedColourId: string;
  selectedColourLabel?: string;
  selectedColourHex?: string;
  customColour?: string;
  quantity: number;
  commerceProductId?: string;
  commerceVariantId?: string;
};

type CartContextType = {
  items: CartItem[];
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (slug: string, size: string, selectedColourId: string, customColour?: string) => void;
  updateQuantity: (slug: string, size: string, selectedColourId: string, quantity: number, customColour?: string) => void;
  updateSize: (slug: string, oldSize: string, newSize: string, newCommerceVariantId: string | undefined, selectedColourId: string, customColour?: string) => void;
  clearCart: () => void;
  cartTotal: number;
  itemCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_KEY = 'soso-cart';
const MAX_CART_ITEMS = 100;

function readStoredCart(): CartItem[] {
  try {
    const saved = window.localStorage.getItem(CART_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_CART_ITEMS).flatMap((item): CartItem[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.slug !== 'string'
        || typeof candidate.name !== 'string'
        || typeof candidate.img !== 'string'
        || typeof candidate.size !== 'string'
        || typeof candidate.selectedColourId !== 'string'
        || (candidate.selectedColourLabel !== undefined && typeof candidate.selectedColourLabel !== 'string')
        || (candidate.selectedColourHex !== undefined && (typeof candidate.selectedColourHex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(candidate.selectedColourHex)))
        || typeof candidate.price !== 'number'
        || !Number.isFinite(candidate.price)
        || typeof candidate.quantity !== 'number'
        || !Number.isInteger(candidate.quantity)
        || candidate.quantity < 1
      ) return [];
      return [{
        slug: candidate.slug,
        name: candidate.name,
        img: candidate.img,
        size: candidate.size,
        price: candidate.price,
        quantity: candidate.quantity,
         selectedColourId: candidate.selectedColourId,
         ...(typeof candidate.selectedColourLabel === 'string' ? { selectedColourLabel: candidate.selectedColourLabel } : {}),
         ...(typeof candidate.selectedColourHex === 'string' ? { selectedColourHex: candidate.selectedColourHex } : {}),
         ...(typeof candidate.customColour === 'string' ? { customColour: candidate.customColour } : {}),
        ...(typeof candidate.commerceProductId === 'string' ? { commerceProductId: candidate.commerceProductId } : {}),
        ...(typeof candidate.commerceVariantId === 'string' ? { commerceVariantId: candidate.commerceVariantId } : {}),
      }];
    });
  } catch {
    // Local storage may be unavailable, blocked, or contain invalid JSON.
    return [];
  }
}

function persistCart(items: CartItem[]): void {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // Keep the current cart in memory when persistence is unavailable or full.
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    persistCart(items);
  }, [items]);

  const openDrawer = () => setIsDrawerOpen((isOpen) => {
    if (!isOpen) trackStorefrontEvent('cart_opened');
    return true;
  });
  const closeDrawer = () => setIsDrawerOpen(false);

  const addItem = (newItem: Omit<CartItem, 'quantity'>) => {
    trackStorefrontEvent('add_to_bag', {
      productSlug: newItem.slug,
      commerceProductId: newItem.commerceProductId,
      itemIds: [newItem.commerceVariantId ?? newItem.commerceProductId ?? newItem.slug],
      value: newItem.price,
      currency: 'NGN',
      quantity: 1,
      itemCount: 1,
    });
    setItems(current => {
      const sameLine = (i: CartItem) => isSameCartLine(i, newItem);
      const existing = current.find(sameLine);
      if (existing) {
        return current.map(i => 
          sameLine(i)
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...current, { ...newItem, quantity: 1 }];
    });
    openDrawer();
  };

  const removeItem = (slug: string, size: string, selectedColourId: string, customColour?: string) => {
    setItems(current => current.filter(i => !(i.slug === slug && i.size === size && i.selectedColourId === selectedColourId && i.customColour === customColour)));
  };

  const updateQuantity = (slug: string, size: string, selectedColourId: string, quantity: number, customColour?: string) => {
    if (quantity < 1) return removeItem(slug, size, selectedColourId, customColour);
    setItems(current => 
      current.map(i => 
        i.slug === slug && i.size === size && i.selectedColourId === selectedColourId && i.customColour === customColour ? { ...i, quantity } : i
      )
    );
  };

  const updateSize = (slug: string, oldSize: string, newSize: string, newCommerceVariantId: string | undefined, selectedColourId: string, customColour?: string) => {
    setItems((current) => changeCartLineSelection(
      current,
      slug,
      oldSize,
      newSize,
      newCommerceVariantId,
      selectedColourId,
      customColour,
    ));
  };

  const clearCart = () => setItems([]);

  const cartTotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      addItem,
      removeItem,
      updateQuantity,
      updateSize,
      clearCart,
      cartTotal,
      itemCount
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
