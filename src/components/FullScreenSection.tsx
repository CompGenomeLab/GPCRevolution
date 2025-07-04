'use client';

import { useState, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2 } from 'lucide-react';
import { Button } from './ui/button';

interface FullScreenSectionProps {
  children: ReactNode;
}

export default function FullScreenSection({ children }: FullScreenSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure this runs only in browser
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Background overlay when fullscreen
  const overlay = isOpen ? (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
    />
  ) : null;

  // Wrapper classes toggle between normal flow and fullscreen fixed
  const wrapperClasses = isOpen
    ? 'fixed left-4 right-4 top-24 bottom-4 md:left-8 md:right-8 md:top-28 md:bottom-8 lg:left-16 lg:right-16 lg:top-32 lg:bottom-12 z-[100] flex flex-col bg-background rounded-lg shadow-lg overflow-auto fullscreen-override'
    : 'relative';

  return (
    <>
      {overlay && createPortal(overlay, document.body)}
      <div className={wrapperClasses}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(prev => !prev)}
          aria-label={isOpen ? 'Exit fullscreen' : 'Expand to fullscreen'}
          className={`absolute top-4 right-4 ${isOpen ? 'z-[110]' : 'z-20'}`}
        >
          {isOpen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
        {children}
      </div>
      {isOpen && (
        <style>{`
          .fullscreen-override [class*='h-\[640px\]'] { height: 80vh !important; }
        `}</style>
      )}
    </>
  );
} 