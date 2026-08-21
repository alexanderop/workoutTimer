/**
 * The picker chip look, shared by TimePicker's and ValuePicker's option rows
 * and the circuit editor's kind toggle. One home for the press-state styling
 * docs/touch-conventions.md calls load-bearing (`active:scale` eased by the
 * `transition-[…scale]` list, `touch-manipulation`, `select-none`) — callers
 * add only their layout extras (`snap-center` in a scroll row).
 */
export function chipClass(selected: boolean): string {
  return `h-touch-target shrink-0 select-none touch-manipulation rounded-full border px-4 font-medium transition-[color,background-color,border-color,scale] duration-100 active:scale-95 ${
    selected
      ? 'border-transparent bg-[var(--mode-color)] text-[var(--mode-foreground)]'
      : 'bg-background'
  }`
}
