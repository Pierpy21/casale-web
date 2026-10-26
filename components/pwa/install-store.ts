"use client";

import { useSyncExternalStore } from "react";

/** Evento non standard di Chrome/Edge/Samsung Internet (Android e desktop). Non presente su iOS. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallState {
  /** Prompt nativo salvato, pronto da mostrare con un tocco. */
  deferred: BeforeInstallPromptEvent | null;
  /** L'app è stata installata in questa sessione del browser. */
  installed: boolean;
}

declare global {
  interface Window {
    __agendaDeferredPrompt?: BeforeInstallPromptEvent | null;
    __agendaAppInstalled?: boolean;
  }
}

const SERVER_STATE: InstallState = { deferred: null, installed: false };

let state: InstallState = SERVER_STATE;
let initialized = false;
const listeners = new Set<() => void>();

function setState(next: InstallState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Registra i listener globali una sola volta. Chiamato dal componente InstallCapture nel root layout. */
export function initInstallStore(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Eventi già catturati dallo script inline prima dell'idratazione.
  const early = window.__agendaDeferredPrompt ?? null;
  if (early || window.__agendaAppInstalled) {
    setState({ deferred: early, installed: window.__agendaAppInstalled === true });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    setState({ deferred: event as BeforeInstallPromptEvent, installed: state.installed });
  });
  window.addEventListener("appinstalled", () => {
    window.__agendaDeferredPrompt = null;
    setState({ deferred: null, installed: true });
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  return state;
}

function getServerSnapshot(): InstallState {
  return SERVER_STATE;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function noopSubscribe(): () => void {
  return () => {};
}

/** true se l'app gira già installata (display standalone o iOS `navigator.standalone`). */
export function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useIsStandalone(): boolean {
  return useSyncExternalStore(noopSubscribe, isStandaloneNow, () => false);
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** iPhone/iPad con Safari: l'unico browser iOS che può aggiungere l'app alla Home. */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return isIosDevice() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export type PromptOutcome = "accepted" | "dismissed" | "unavailable";

/** Lancia il prompt nativo salvato. Il prompt può essere usato una sola volta. */
export async function promptInstall(): Promise<PromptOutcome> {
  const event = state.deferred;
  if (!event) return "unavailable";
  setState({ deferred: null, installed: state.installed });
  window.__agendaDeferredPrompt = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}
