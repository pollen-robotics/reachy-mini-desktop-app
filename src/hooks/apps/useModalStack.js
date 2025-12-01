import { useState, useMemo } from 'react';

/**
 * Hook for managing modal stack
 * Handles opening/closing modals with proper navigation
 */
export function useModalStack() {
  const [modalStack, setModalStack] = useState([]);
  
  const openModal = (modalType) => {
    setModalStack(prev => [...prev, modalType]);
  };
  
  const closeModal = () => {
    setModalStack(prev => prev.slice(0, -1));
  };
  
  const closeAllModals = () => {
    setModalStack([]);
  };
  
  // Derived state for each modal - only the top modal in stack is open
  const discoverModalOpen = useMemo(() => 
    modalStack[modalStack.length - 1] === 'discover',
    [modalStack]
  );
  
  const createAppTutorialModalOpen = useMemo(() => 
    modalStack[modalStack.length - 1] === 'createTutorial',
    [modalStack]
  );
  
  return {
    modalStack,
    openModal,
    closeModal,
    closeAllModals,
    discoverModalOpen,
    createAppTutorialModalOpen,
  };
}

