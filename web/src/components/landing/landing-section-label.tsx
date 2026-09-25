export function LandingSectionLabel({ number, children }: { number: string; children: string }) {
  return (
    <p className="font-mono text-[10px] font-bold tracking-[0.23em] uppercase text-secondary">
      [{number}] {children}
    </p>
  )
}
