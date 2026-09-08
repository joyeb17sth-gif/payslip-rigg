'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, Check, Search, Plus, User } from 'lucide-react';
import { ContractorDirectory } from '@/lib/data';

interface ContractorComboboxProps {
  value: string;
  onChange: (val: string) => void;
  client: string;
  location: string;
  directory?: ContractorDirectory;
  placeholder?: string;
  className?: string;
}

export default function ContractorCombobox({
  value,
  onChange,
  client,
  location,
  directory = {},
  placeholder = 'Select contractor...',
  className = '',
}: ContractorComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 220 });
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronize internal search term with incoming value
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Compute contractors available for current client & location
  const locationContractors = useMemo(() => {
    if (!directory) return [];
    
    // Find matching client (case-insensitive)
    const clientKey = Object.keys(directory).find(
      c => c.toLowerCase() === (client || '').toLowerCase()
    );
    const locMap = clientKey ? directory[clientKey] : undefined;
    if (!locMap) return [];

    // Find matching location (case-insensitive)
    const locKey = Object.keys(locMap).find(
      l => l.toLowerCase() === (location || '').toLowerCase()
    );
    return locKey ? locMap[locKey] : [];
  }, [directory, client, location]);

  // Filter based on search query
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return locationContractors;
    return locationContractors.filter(name => 
      name.toLowerCase().includes(q)
    );
  }, [locationContractors, searchTerm]);

  // Update dropdown portal position
  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 4;
      const left = rect.left + window.scrollX;
      const width = Math.max(rect.width, 240);
      setCoords({ top, left, width });
    }
  };

  const handleOpen = () => {
    updatePosition();
    setIsOpen(true);
    setHighlightIndex(-1);
  };

  const handleClose = () => {
    setIsOpen(false);
    setHighlightIndex(-1);
    // If the user typed something, commit it
    if (searchTerm !== value) {
      onChange(searchTerm);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        handleClose();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, searchTerm, value]);

  const selectContractor = (name: string) => {
    setSearchTerm(name);
    onChange(name);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        handleOpen();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        selectContractor(filtered[highlightIndex]);
      } else if (searchTerm.trim()) {
        selectContractor(searchTerm.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  const exactMatch = locationContractors.some(
    c => c.toLowerCase() === searchTerm.trim().toLowerCase()
  );

  return (
    <div ref={containerRef} className={`relative inline-block w-full min-w-[180px] ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          placeholder={placeholder}
          onFocus={handleOpen}
          onClick={handleOpen}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onChange(e.target.value);
            if (!isOpen) handleOpen();
          }}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded-md border border-input bg-background pl-2.5 pr-8 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              handleClose();
            } else {
              inputRef.current?.focus();
              handleOpen();
            }
          }}
          className="absolute right-1.5 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Toggle contractors list"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOpen && mounted && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 9999,
          }}
          className="rounded-lg border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
        >
          {/* Header with location info */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 border-b text-[11px] font-medium text-muted-foreground">
            <span className="truncate">
              📍 <span className="font-semibold text-foreground">{location || 'All'}</span> ({locationContractors.length})
            </span>
            <span className="text-[10px] uppercase tracking-wider">{client}</span>
          </div>

          {/* List of contractors */}
          <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No contractors found matching &quot;{searchTerm}&quot;
              </div>
            ) : (
              filtered.map((name, idx) => {
                const isSelected = name.toLowerCase() === (value || '').toLowerCase();
                const isHighlighted = idx === highlightIndex;

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectContractor(name)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-colors cursor-pointer ${
                      isHighlighted
                        ? 'bg-accent text-accent-foreground'
                        : isSelected
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'hover:bg-accent/70 text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{name}</span>
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 ml-1" />
                    )}
                  </button>
                );
              })
            )}

            {/* If user typed a custom name not in list, let them click to use it */}
            {searchTerm.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => selectContractor(searchTerm.trim())}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 mt-1 border-t rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-left transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Use &quot;<span className="font-semibold">{searchTerm.trim()}</span>&quot; (Custom)</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
