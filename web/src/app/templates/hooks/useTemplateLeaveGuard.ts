"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GuardedAction = () => void | Promise<void>;

export function useTemplateLeaveGuard({
  dirty,
  saving,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<boolean>;
}) {
  const [pendingChange, setPendingChange] = useState(false);
  const [requestedSelection, setRequestedSelection] = useState<string | null>(null);
  const pendingActionRef = useRef<GuardedAction | null>(null);

  const clear = useCallback(() => {
    pendingActionRef.current = null;
    setPendingChange(false);
    setRequestedSelection(null);
  }, []);

  const request = useCallback((action: GuardedAction, selectionID: string | null = null) => {
    if (saving) return;
    if (!dirty) {
      void action();
      return;
    }
    pendingActionRef.current = action;
    setRequestedSelection(selectionID);
    setPendingChange(true);
  }, [dirty, saving]);

  const continueWithPending = useCallback(() => {
    const action = pendingActionRef.current;
    clear();
    if (action) void action();
  }, [clear]);

  const saveAndContinue = useCallback(async () => {
    if (saving || !pendingActionRef.current) return;
    if (await onSave()) continueWithPending();
  }, [continueWithPending, onSave, saving]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      Reflect.set(event, "returnValue", "");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return {
    pendingChange,
    requestedSelection,
    request,
    cancelPendingChange: clear,
    discardAndContinue: continueWithPending,
    saveAndContinue,
  };
}
