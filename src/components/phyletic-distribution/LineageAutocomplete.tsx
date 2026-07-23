'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface LineageAutocompleteProps {
  suggestions: string[]
  onSelect: (value: string) => void
  placeholder?: string
}

export default function LineageAutocomplete({
  suggestions,
  onSelect,
  placeholder = 'Search lineage...',
}: LineageAutocompleteProps) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 })

  const normalize = (text: string) =>
    text.toLowerCase().replace(/(^|\b)([dpcofgs])_/, '$1$2__')

  const filtered = useMemo(
    () => suggestions.filter(option => normalize(option).includes(normalize(value))),
    [suggestions, value]
  )

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const input = inputRef.current
      if (!input) return
      const rect = input.getBoundingClientRect()
      setMenuPosition({
        top: Math.round(rect.bottom + 4),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const insideInput = Boolean(inputRef.current?.contains(target))
      const insideMenu = Boolean(menuRef.current?.contains(target))
      if (!insideInput && !insideMenu) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectValue = (selection: string) => {
    setValue(selection)
    onSelect(selection)
    setOpen(false)
  }

  return (
    <div className="lineage-autocomplete relative">
      <input
        ref={inputRef}
        type="text"
        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={menuId}
        aria-expanded={open}
        onChange={event => {
          setValue(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={event => {
          if (event.key === 'Enter') selectValue(value)
          if (event.key === 'Escape') setOpen(false)
        }}
      />

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          className="fixed z-[100100] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: Math.max(180, menuPosition.width),
          }}
        >
          <div className="max-h-64 overflow-y-auto">
            {filtered.slice(0, 200).map(option => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectValue(option)}
              >
                {option}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">No matches</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
