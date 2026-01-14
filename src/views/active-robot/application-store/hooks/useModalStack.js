import { useState, useMemo } from 'react';
import { telemetry } from '@/utils/telemetry';

/**
 * Hook for managing modal stack
 * Handles opening/closing modals with proper navigation
 */
export function useModalStack() {
  const [modalStack, setModalStack] = useState([]);

  const openModal = modalType => {
    setModalStack(prev => [...prev, modalType]);

    // 📊 Telemetry
    if (modalType === 'discover') {
      telemetry.discoverOpened();
    }
  };

  const closeModal = () => {
    setModalStack(prev => prev.slice(0, -1));
  };

  const closeAllModals = () => {
    setModalStack([]);
  };

  // Derived state for each modal
  // isInStack: modal is in the stack (should be mounted)
  // isOnTop: modal is at the top of the stack (should be visible/interactive)
  const discoverModalOpen = useMemo(() => modalStack.includes('discover'), [modalStack]);

  const discoverModalOnTop = useMemo(
    () => modalStack[modalStack.length - 1] === 'discover',
    [modalStack]
  );

  const createAppTutorialModalOpen = useMemo(
    () => modalStack.includes('createTutorial'),
    [modalStack]
  );

  const createAppTutorialModalOnTop = useMemo(
    () => modalStack[modalStack.length - 1] === 'createTutorial',
    [modalStack]
  );

  return {
    modalStack,
    openModal,
    closeModal,
    closeAllModals,
    discoverModalOpen,
    discoverModalOnTop,
    createAppTutorialModalOpen,
    createAppTutorialModalOnTop,
  };
}
