import React, { createContext, useContext, useState, useEffect } from 'react';

export type CartItem = {
  slug: string;
  name: string;
  img: string;
  price: number;
  size: string;
  quantity: number;
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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('soso-cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('soso-cart', JSON.stringify(items));
  }, [items]);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  const addItem = (newItem: Omit<CartItem, 'quantity'>) => {
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
