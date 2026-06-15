import * as React from "react"
import { X } from "lucide-react"
import { Badge } from "./badge"
import { Command, CommandGroup, CommandItem, CommandList } from "./command"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { cn } from "./utils"

export interface TagInputProps {
  tags: string[]
  suggestions: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ tags, suggestions, onTagsChange, placeholder = "Add tag..." }: TagInputProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [containerWidth, setContainerWidth] = React.useState<number>(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Update width for popover
  React.useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth)
    }
  }, [open])

  const handleUnselect = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag))
  }

  const handleSelect = (tag: string) => {
    setInputValue("")
    if (!tags.includes(tag)) {
      onTagsChange([...tags, tag])
    }
    // Don't close immediately if user might want to add more, but typically one at a time is fine
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      onTagsChange(tags.slice(0, -1))
    }
    if (e.key === "Enter" && inputValue !== "") {
      e.preventDefault()
      // If there's an exact match in suggestions or it's a new tag, add it
      if (!tags.includes(inputValue)) {
        onTagsChange([...tags, inputValue])
      }
      setInputValue("")
      setOpen(false)
    }
    if (e.key === "Escape") {
      setOpen(false)
    }
  }

  // "Loosy goosy" filter: check if suggestion contains input chars in order (fuzzy-ish)
  const isMatch = (item: string, query: string) => {
    if (!query) return true
    const q = query.toLowerCase()
    const i = item.toLowerCase()
    if (i.includes(q)) return true
    
    // Simple fuzzy: all chars in query exist in item in any order
    return q.split('').every(char => i.includes(char))
  }

  const filteredSuggestions = suggestions.filter(
    (suggestion) => !tags.includes(suggestion) && isMatch(suggestion, inputValue)
  )

  return (
    <div className="flex flex-col gap-2 w-full" ref={containerRef}>
      <div className="flex flex-wrap gap-1.5 min-h-[20px]">
        {tags.map((tag) => (
          <Badge
            key={tag}
            style={{
              background: "rgba(0,229,255,0.1)",
              border: "1px solid var(--cp-cyan)",
              color: "var(--cp-cyan)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider"
          >
            {tag}
            <button
              onClick={() => handleUnselect(tag)}
              className="hover:text-[var(--cp-magenta)] transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative w-full">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                if (!open) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              placeholder={tags.length === 0 ? placeholder : "Add more..."}
              style={{
                background: "var(--cp-bg-2)",
                border: `1px solid ${open ? "var(--cp-cyan)" : "var(--cp-border)"}`,
                color: "var(--foreground)",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              className="w-full px-3 py-2 text-xs focus:outline-none transition-colors placeholder:opacity-30"
            />
          </div>
        </PopoverTrigger>
        {open && filteredSuggestions.length > 0 && (
          <PopoverContent 
            className="p-0 border-[var(--cp-border)] bg-[var(--cp-bg-2)] shadow-[0_0_20px_rgba(0,0,0,0.5)]" 
            align="start"
            style={{ width: containerWidth }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command className="bg-transparent" shouldFilter={false}>
              <CommandList className="max-h-[200px] overflow-y-auto">
                <CommandGroup>
                  {filteredSuggestions.map((suggestion) => (
                    <CommandItem
                      key={suggestion}
                      onSelect={() => handleSelect(suggestion)}
                      style={{
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
                      className="text-xs py-2 px-3 data-[selected=true]:bg-[rgba(0,229,255,0.1)] data-[selected=true]:text-[var(--cp-cyan)] cursor-pointer transition-colors"
                    >
                      {suggestion}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        )}
      </Popover>
    </div>
  )
}
