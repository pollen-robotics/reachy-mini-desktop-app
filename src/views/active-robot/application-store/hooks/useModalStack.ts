import { useState, useMemo } from 'react';
import { telemetry } from '@/utils/telemetry';

type ModalType = 'discover' | 'createTutorial' | string;

interface UseModalStackReturn {
  modalStack: ModalType[];
  openModal: (modalType: ModalType) => void;
  closeModal: () => void;
  closeAllModals: () => void;
  discoverModalOpen: boolean;
  discoverModalOnTop: boolean;
  createAppTutorialModalOpen: boolean;
  createAppTutorialModalOnTop: boolean;
}

export function useModalStack(): UseModalStackReturn {
  const [modalStack, setModalStack] = useState<ModalType[]>([]);

  const openModal = (modalType: ModalType): void => {
    setModalStack(prev => [...prev, modalType]);

    if (modalType === 'discover') {
      telemetry.discoverOpened();
    }
  };

  const closeModal = (): void => {
    setModalStack(prev => prev.slice(0, -1));
  };

  const closeAllModals = (): void => {
    setModalStack([]);
  };

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
