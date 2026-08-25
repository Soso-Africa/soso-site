import React, { createContext, useContext, useState, useEffect } from 'react';
import { trackStorefrontEvent } from '@/components/ConsentManager';

export type CartItem = {
  slug: string;
  name: string;
  img: string;
  price: number;
  size: string;
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
  removeItem: (slug: string, size: string) => void;
  updateQuantity: (slug: string, size: string, quantity: number) => void;
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
      const existing = current.find(i => i.slug === newItem.slug && i.size === newItem.size);
      if (existing) {
        return current.map(i => 
          i.slug === newItem.slug && i.size === newItem.size 
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...current, { ...newItem, quantity: 1 }];
    });
    openDrawer();
  };

  const removeItem = (slug: string, size: string) => {
    setItems(current => current.filter(i => !(i.slug === slug && i.size === size)));
  };

  const updateQuantity = (slug: string, size: string, quantity: number) => {
    if (quantity < 1) return removeItem(slug, size);
    setItems(current => 
      current.map(i => 
        i.slug === slug && i.size === size ? { ...i, quantity } : i
      )
    );
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
